package jumin.domain.parking.repository;

import static jumin.config.ViewportCacheProperties.DB_QUEUE;
import static jumin.config.ViewportCacheProperties.MAX_CELLS;
import static jumin.config.ViewportCacheProperties.MAX_CELL_ROWS;
import static jumin.config.ViewportCacheProperties.MAX_FALLBACK_ROWS;
import static jumin.config.ViewportCacheProperties.MAX_REQUEST_BYTES;

import jakarta.annotation.PreDestroy;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;
import javax.sql.DataSource;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.domain.parking.dto.ParkingLotViewportResponse;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
import jumin.domain.parking.dto.ViewportBody;
import jumin.domain.parking.exception.ViewportFailureReason;
import jumin.domain.parking.exception.ViewportFallbackException;
import jumin.domain.parking.model.ViewportBounds;
import jumin.domain.parking.model.ViewportCell;
import jumin.domain.parking.model.ViewportCellKey;
import jumin.domain.parking.model.ViewportDeadline;
import jumin.domain.parking.model.ViewportItem;
import jumin.domain.parking.model.ViewportMappingState;
import jumin.domain.parking.monitoring.ViewportMetrics;
import jumin.domain.parking.service.ParkingLodScoreCalculator;
import jumin.domain.parking.service.ViewportSquareGrid;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

@Repository
public class ViewportRepository {

    private static final String VIEWPORT_FIELDS = """
            l.id, l.latitude, l.longitude, l.capacity, l.mechanical, l.is_public,
            o.weekday_paid, o.saturday_paid, o.holiday_paid
            """;
    private static final String SELECT_CELLS_SQL = """
            WITH cells AS (SELECT unnest(ARRAY[:cells]::BIGINT[]) AS cell_id)
            SELECT state.grid_size_meters, state.projection_ready,
                   cells.cell_id,
            """ + VIEWPORT_FIELDS + """
            FROM parking_viewport_cache_state state
            CROSS JOIN cells
            LEFT JOIN LATERAL (
                SELECT source.* FROM parking_lots source
                WHERE source.viewport_grid_cell = cells.cell_id
                  AND source.active = TRUE AND source.location IS NOT NULL
                  AND source.name IS NOT NULL AND source.address IS NOT NULL
                ORDER BY source.id LIMIT :cell_row_limit
            ) l ON TRUE
            LEFT JOIN parking_operations o ON o.parking_lot_id = l.id
            WHERE state.id = 1
            ORDER BY cells.cell_id, l.id
            """;
    private static final String SELECT_FALLBACK_SQL = "SELECT " + VIEWPORT_FIELDS + """
            FROM parking_lots l LEFT JOIN parking_operations o ON o.parking_lot_id = l.id
            WHERE l.active = TRUE AND l.location IS NOT NULL
              AND l.name IS NOT NULL AND l.address IS NOT NULL
              AND l.location && ST_MakeEnvelope(:west, :south, :east, :north, 4326)::geography
              AND l.longitude BETWEEN :west AND :east AND l.latitude BETWEEN :south AND :north
              AND (:free = FALSE OR (:day BETWEEN 1 AND 5 AND o.weekday_paid = FALSE)
                   OR (:day = 6 AND o.saturday_paid = FALSE) OR (:day = 7 AND o.holiday_paid = FALSE))
              AND (:mechanical = FALSE OR l.mechanical = FALSE)
              AND (:public = FALSE OR l.is_public = TRUE)
            ORDER BY l.id LIMIT :row_limit
            """;

    private static final int BATCH_SIZE = 500;
    private static final String LOCK_MAPPING_STATE_SQL = """
            SELECT grid_size_meters, projection_ready
            FROM parking_viewport_cache_state WHERE id = 1
            """ + " FOR UPDATE";
    private static final String LOCK_SOURCE_SQL = "LOCK TABLE parking_lots IN SHARE ROW EXCLUSIVE MODE";
    private static final String UPDATE_CELL_MAPPING_SQL = """
            UPDATE parking_lots SET viewport_grid_cell = ?
            WHERE id = ? AND latitude IS NOT DISTINCT FROM ?
              AND longitude IS NOT DISTINCT FROM ?
            """;
    private static final String MAPPING_BATCH_SELECT = """
            SELECT id, latitude, longitude, viewport_grid_cell,
                   ST_X(location::geometry) AS location_longitude,
                   ST_Y(location::geometry) AS location_latitude,
                   COALESCE(ST_IsEmpty(location::geometry), TRUE) AS empty_location
            FROM parking_lots
            """;
    private static final String SELECT_FIRST_MAPPING_BATCH_SQL = MAPPING_BATCH_SELECT
            + " ORDER BY id LIMIT " + BATCH_SIZE;
    private static final String SELECT_NEXT_MAPPING_BATCH_SQL = MAPPING_BATCH_SELECT
            + "WHERE id > ? ORDER BY id LIMIT " + BATCH_SIZE;
    private static final String UPDATE_MAPPING_STATE_SQL = """
            UPDATE parking_viewport_cache_state SET grid_size_meters = ?, projection_ready = ? WHERE id = 1
            """;
    private static final String SET_STATEMENT_TIMEOUT_SQL_PREFIX = "SET LOCAL statement_timeout = ";

    private final JdbcTemplate mappingJdbc;
    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;
    private final ViewportMetrics metrics;
    private final ParkingLodScoreCalculator scores;
    private final ViewportSquareGrid grid;
    private final PlatformTransactionManager transactions;
    private final long dbTimeoutNanos;
    private final ReentrantLock admission = new ReentrantLock(true);
    private final Condition capacity = admission.newCondition();
    private final int maximum;
    private final AtomicInteger queued = new AtomicInteger();
    private final AtomicInteger active = new AtomicInteger();
    private final Map<String, AtomicInteger> activeByStage = new ConcurrentHashMap<>();
    private volatile boolean closed;

    public ViewportRepository(JdbcTemplate primaryJdbc, ViewportCacheProperties properties, ViewportMetrics metrics,
                              ParkingLodScoreCalculator scores, ViewportSquareGrid grid) {
        DataSource source = Objects.requireNonNull(primaryJdbc.getDataSource(), "viewport DataSource is required");
        mappingJdbc = primaryJdbc;
        this.metrics = metrics;
        this.scores = scores;
        this.grid = grid;
        dbTimeoutNanos = properties.getDbTimeout().toNanos();
        jdbc = new JdbcTemplate(source);
        jdbc.setFetchSize(128);
        jdbc.setQueryTimeout(secondsCeiling(properties.getDbTimeout()));
        named = new NamedParameterJdbcTemplate(jdbc);
        transactions = new DataSourceTransactionManager(source);
        maximum = properties.getMaxConcurrentDb();
        metrics.registerDatabase(active, queued, stageActive("source"), stageActive("fallback"));
    }

    public Map<ViewportCellKey, ViewportCell> load(
            List<ViewportCellKey> keys,
            ViewportDeadline deadline
    ) {
        if (keys.isEmpty() || keys.size() > MAX_CELLS) {
            throw new IllegalArgumentException("셀 batch 범위가 잘못되었습니다.");
        }
        int gridSizeMeters = keys.getFirst().gridSizeMeters();
        if (keys.stream().anyMatch(key -> key.gridSizeMeters() != gridSizeMeters)) {
            throw new IllegalArgumentException("서로 다른 격자 크기는 로딩할 수 없습니다.");
        }
        MapSqlParameterSource parameters = new MapSqlParameterSource("cells", keys.stream()
                .map(ViewportCellKey::cellId).toList())
                .addValue("cell_row_limit", MAX_CELL_ROWS + 1);
        return read("source", deadline, () -> {
            deadline.requireRemaining();
            metrics.count("sql", "cell_batch", 1);
            return named.query(SELECT_CELLS_SQL, parameters, rows -> {
                return readCells(rows, keys, gridSizeMeters, deadline);
            });
        });
    }

    private Map<ViewportCellKey, ViewportCell> readCells(ResultSet rows, List<ViewportCellKey> keys,
                                                          int gridSizeMeters, ViewportDeadline deadline)
            throws SQLException {
        Map<Long, List<ViewportItem>> items = new LinkedHashMap<>();
        keys.forEach(key -> items.put(key.cellId(), new ArrayList<>()));
        boolean sawState = false;
        long count = 0;
        while (nextRow(rows, deadline)) {
            sawState = true;
            if (!rows.getBoolean("projection_ready") || rows.getInt("grid_size_meters") != gridSizeMeters) {
                throw ViewportFallbackException.mappingUnavailable();
            }
            if (rows.getObject("id", Long.class) == null) {
                continue;
            }
            List<ViewportItem> cell = items.get(rows.getLong("cell_id"));
            if (cell == null || cell.size() >= MAX_CELL_ROWS
                    || ++count * 160L > MAX_REQUEST_BYTES) {
                throw ViewportFallbackException.cellTooLarge();
            }
            cell.add(itemOf(rows));
        }
        if (!sawState) {
            throw ViewportFallbackException.mappingUnavailable();
        }
        Map<ViewportCellKey, ViewportCell> result = new LinkedHashMap<>();
        keys.forEach(key -> result.put(key, new ViewportCell(key, items.get(key.cellId()))));
        deadline.requireRemaining();
        return Map.copyOf(result);
    }

    public ViewportBody fallback(ViewportBounds bounds, ParkingLotViewportRequest request, int day,
                                       ViewportDeadline deadline) {
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("west", bounds.west()).addValue("south", bounds.south())
                .addValue("east", bounds.east()).addValue("north", bounds.north())
                .addValue("free", request.freeOnly()).addValue("mechanical", request.excludeMechanical())
                .addValue("public", request.isPublic()).addValue("day", day)
                .addValue("row_limit", MAX_FALLBACK_ROWS + 1);
        return read("fallback", deadline, () -> {
            deadline.requireRemaining();
            metrics.count("sql", "fallback", 1);
            return named.query(SELECT_FALLBACK_SQL, parameters, rows -> {
                return readFallback(rows, deadline);
            });
        });
    }

    private ViewportBody readFallback(ResultSet rows, ViewportDeadline deadline) throws SQLException {
        List<ParkingLotViewportResponse> response = new ArrayList<>();
        while (nextRow(rows, deadline)) {
            if (response.size() >= MAX_FALLBACK_ROWS) {
                throw ViewportFailureReason.UNCLASSIFIED.failure();
            }
            ViewportItem item = itemOf(rows);
            response.add(new ParkingLotViewportResponse(item.id(), item.latitude(), item.longitude(),
                    scores.calculate(item.capacity())));
        }
        deadline.requireRemaining();
        return new ViewportBody(ParkingLotViewportResponses.from(response));
    }

    private static boolean nextRow(ResultSet rows, ViewportDeadline deadline) throws SQLException {
        deadline.requireRemaining();
        boolean present = rows.next();
        deadline.requireRemaining();
        return present;
    }

    private static ViewportItem itemOf(ResultSet rows) throws SQLException {
        return new ViewportItem(rows.getLong("id"), rows.getDouble("latitude"), rows.getDouble("longitude"),
                rows.getObject("capacity", Integer.class), rows.getObject("mechanical", Boolean.class),
                rows.getObject("is_public", Boolean.class), rows.getObject("weekday_paid", Boolean.class),
                rows.getObject("saturday_paid", Boolean.class), rows.getObject("holiday_paid", Boolean.class));
    }

    public boolean repairAndVerify(int gridSizeMeters) {
        Long afterId = null;
        boolean valid = true;
        while (true) {
            List<MappingRow> rows = findBatch(afterId);
            if (rows.isEmpty()) {
                return valid;
            }
            MappingBatch batch = evaluateBatch(rows, gridSizeMeters);
            if (!batch.valid()) {
                valid = false;
            }
            applyUpdates(batch.updates());
            afterId = rows.getLast().id();
        }
    }

    private MappingBatch evaluateBatch(List<MappingRow> rows, int gridSizeMeters) {
        List<Object[]> updates = new ArrayList<>();
        boolean valid = true;
        for (MappingRow row : rows) {
            boolean validCoordinates = hasValidCoordinates(row);
            Long desired = desiredCellId(row, validCoordinates, gridSizeMeters);
            if (validCoordinates && hasMismatchedLocation(row)) {
                valid = false;
            }
            if (!Objects.equals(desired, row.cellId())) {
                updates.add(new Object[]{desired, row.id(), row.latitude(), row.longitude()});
            }
        }
        return new MappingBatch(updates, valid);
    }

    private static boolean hasValidCoordinates(MappingRow row) {
        if (row.latitude() == null || row.longitude() == null) {
            return false;
        }
        if (!Double.isFinite(row.latitude()) || !Double.isFinite(row.longitude())) {
            return false;
        }
        return row.latitude() >= -90 && row.latitude() <= 90
                && row.longitude() >= -180 && row.longitude() <= 180;
    }

    private Long desiredCellId(MappingRow row, boolean validCoordinates, int gridSizeMeters) {
        if (!validCoordinates || !grid.supports(row.latitude(), row.longitude())) {
            return null;
        }
        return grid.cellId(row.latitude(), row.longitude(), gridSizeMeters);
    }

    private static boolean hasMismatchedLocation(MappingRow row) {
        if (row.emptyLocation() || row.locationLatitude() == null || row.locationLongitude() == null) {
            return true;
        }
        return row.latitude().doubleValue() != row.locationLatitude().doubleValue()
                || row.longitude().doubleValue() != row.locationLongitude().doubleValue();
    }

    private void applyUpdates(List<Object[]> updates) {
        if (updates.isEmpty()) {
            return;
        }
        int[] counts = mappingJdbc.batchUpdate(UPDATE_CELL_MAPPING_SQL, updates);
        for (int count : counts) {
            if (count != 1) {
                throw new IllegalStateException("동시 원본 변경으로 사각형 grid mapping을 검증할 수 없습니다.");
            }
        }
    }

    private List<MappingRow> findBatch(Long afterId) {
        String sql = SELECT_FIRST_MAPPING_BATCH_SQL;
        Object[] parameters = new Object[0];
        if (afterId != null) {
            sql = SELECT_NEXT_MAPPING_BATCH_SQL;
            parameters = new Object[]{afterId};
        }
        return mappingJdbc.query(sql, (rows, index) -> new MappingRow(rows.getLong("id"),
                rows.getObject("latitude", Double.class), rows.getObject("longitude", Double.class),
                rows.getObject("viewport_grid_cell", Long.class), rows.getObject("location_latitude", Double.class),
                rows.getObject("location_longitude", Double.class), rows.getBoolean("empty_location")), parameters);
    }

    private record MappingBatch(List<Object[]> updates, boolean valid) {
    }

    private record MappingRow(long id, Double latitude, Double longitude, Long cellId,
                              Double locationLatitude, Double locationLongitude, boolean emptyLocation) {
    }

    public ViewportMappingState lockForWrite() {
        requireReadCommitted();
        ViewportMappingState state = lockStateForWrite();
        lockSource();
        return state;
    }

    private void lockSource() {
        mappingJdbc.execute(LOCK_SOURCE_SQL);
    }

    private void requireReadCommitted() {
        mappingJdbc.execute((ConnectionCallback<Void>) connection -> {
            if (connection.getTransactionIsolation() != Connection.TRANSACTION_READ_COMMITTED) {
                throw new IllegalTransactionStateException("viewport 매핑 갱신은 READ COMMITTED가 필요합니다.");
            }
            return null;
        });
    }

    private ViewportMappingState lockStateForWrite() {
        requireTransaction();
        List<ViewportMappingState> states = mappingJdbc.query(LOCK_MAPPING_STATE_SQL, (rows, index) ->
                new ViewportMappingState(rows.getInt("grid_size_meters"), rows.getBoolean("projection_ready")));
        if (states.size() != 1) {
            throw new IllegalStateException("viewport 매핑 상태 한 행을 잠그지 못해 원본 쓰기를 중단합니다.");
        }
        return states.getFirst();
    }

    public ViewportMappingState publishState(int gridSizeMeters, boolean ready) {
        requireTransaction();
        int updated = mappingJdbc.update(UPDATE_MAPPING_STATE_SQL, gridSizeMeters, ready);
        if (updated != 1) {
            throw new IllegalStateException("viewport 매핑 상태 갱신 실패로 원본 transaction을 롤백합니다.");
        }
        return new ViewportMappingState(gridSizeMeters, ready);
    }

    private void requireTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
            throw new IllegalStateException("viewport 매핑 갱신은 공통 쓰기 transaction이 필요합니다.");
        }
    }

    private <T> T read(String stage, ViewportDeadline deadline, Supplier<T> query) {
        acquire(deadline);
        stageActive(stage).incrementAndGet();
        long started = System.nanoTime();
        try {
            T completed = executeRead(deadline, query);
            requireDbRemaining(deadline);
            return completed;
        } catch (RuntimeException | Error failure) {
            if (isUnclassifiedDeadlineFailure(failure, deadline)) {
                throw ViewportFailureReason.DB_DEADLINE.failure(failure);
            }
            throw failure;
        } finally {
            metrics.time(stage, started);
            stageActive(stage).decrementAndGet();
            release();
        }
    }

    private void acquire(ViewportDeadline deadline) {
        admission.lock();
        try {
            requireOpen();
            requireDbRemaining(deadline);
            if (active.get() >= maximum) {
                awaitCapacity(deadline);
            }
            requireOpen();
            requireDbRemaining(deadline);
            active.incrementAndGet();
        } finally {
            admission.unlock();
        }
    }

    private void awaitCapacity(ViewportDeadline deadline) {
        if (queued.get() >= DB_QUEUE) {
            metrics.count("db", "queue_rejected", 1);
            throw ViewportFailureReason.DB_QUEUE_FULL.failure();
        }
        queued.incrementAndGet();
        try {
            while (active.get() >= maximum) {
                requireOpen();
                requireDbRemaining(deadline);
                capacity.awaitNanos(deadline.remainingNanos());
            }
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            throw ViewportFailureReason.DB_DEADLINE.failure(failure);
        } finally {
            queued.decrementAndGet();
        }
    }

    private void release() {
        admission.lock();
        try {
            active.decrementAndGet();
            capacity.signal();
        } finally {
            admission.unlock();
        }
    }

    private void requireOpen() {
        if (closed) {
            throw ViewportFailureReason.DB_SHUTTING_DOWN.failure();
        }
    }

    private <T> T executeRead(ViewportDeadline deadline, Supplier<T> query) {
        long remainingNanos = Math.min(deadline.remainingNanos(), dbTimeoutNanos);
        requireDbRemaining(deadline);
        TransactionTemplate transaction = new TransactionTemplate(transactions);
        transaction.setReadOnly(true);
        transaction.setTimeout(secondsCeiling(Duration.ofNanos(remainingNanos)));
        return transaction.execute(status -> queryInTransaction(deadline, query));
    }

    private <T> T queryInTransaction(ViewportDeadline deadline, Supplier<T> query) {
        requireDbRemaining(deadline);
        long statementTimeoutMillis = Math.max(1, TimeUnit.NANOSECONDS.toMillis(
                Math.min(deadline.remainingNanos(), dbTimeoutNanos)));
        jdbc.execute(SET_STATEMENT_TIMEOUT_SQL_PREFIX + statementTimeoutMillis);
        requireDbRemaining(deadline);
        T value = query.get();
        requireDbRemaining(deadline);
        return value;
    }

    private static boolean isUnclassifiedDeadlineFailure(Throwable failure, ViewportDeadline deadline) {
        if (!(failure instanceof BusinessException exception)) {
            return false;
        }
        if (exception.getErrorCode() != ErrorCode.VIEWPORT_UNAVAILABLE) {
            return false;
        }
        String reason = exception.getReason();
        if (reason != null && !reason.equals(ViewportFailureReason.UNCLASSIFIED.name())) {
            return false;
        }
        return deadline.remainingNanos() == 0 || Thread.currentThread().isInterrupted();
    }

    private static int secondsCeiling(Duration duration) {
        long nanos = duration.toNanos();
        return (int) Math.max(1, 1 + (nanos - 1) / TimeUnit.SECONDS.toNanos(1));
    }

    private static void requireDbRemaining(ViewportDeadline deadline) {
        try {
            deadline.requireRemaining();
        } catch (BusinessException failure) {
            if (failure.getErrorCode() != ErrorCode.VIEWPORT_UNAVAILABLE) {
                throw failure;
            }
            throw ViewportFailureReason.DB_DEADLINE.failure(failure);
        }
    }

    private AtomicInteger stageActive(String stage) {
        return activeByStage.computeIfAbsent(stage, ignored -> new AtomicInteger());
    }

    @PreDestroy
    public void close() {
        admission.lock();
        try {
            closed = true;
            capacity.signalAll();
        } finally {
            admission.unlock();
        }
    }
}
