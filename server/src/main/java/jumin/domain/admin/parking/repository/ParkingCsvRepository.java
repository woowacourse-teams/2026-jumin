package jumin.domain.admin.parking.repository;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;
import jumin.domain.admin.parking.model.ParkingChanges;
import jumin.domain.admin.parking.model.ParkingCsvBatch;
import jumin.domain.admin.parking.model.ParkingCsvKey;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.domain.admin.parking.model.ParkingDbRow;
import jumin.domain.admin.parking.model.ParkingKey;
import jumin.domain.admin.parking.model.ParkingLotValues;
import jumin.domain.admin.parking.model.ParkingOperationValues;
import jumin.domain.admin.parking.model.ParkingScheduleValues;
import jumin.domain.admin.parking.model.ParkingSyncSummary;
import jumin.domain.admin.parking.model.ParkingUpdate;
import jumin.domain.parking.entity.ParkingDataSource;
import jumin.domain.parking.entity.ParkingOperationStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.ParameterizedPreparedStatementSetter;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Repository
@RequiredArgsConstructor
public class ParkingCsvRepository {

    private static final int BATCH_SIZE = 500;
    private static final long IMPORT_LOCK_KEY = 138_2026_0928L;
    private static final Instant NEGATIVE_INFINITY = OffsetDateTime.MIN.toInstant();
    private static final Instant POSITIVE_INFINITY = OffsetDateTime.MAX.toInstant();
    private static final List<String> LOT_COLUMNS = List.of(
            "source", "source_external_id", "name", "sido", "sigungu", "address",
            "latitude", "longitude", "capacity", "mechanical", "is_public", "active",
            "source_checked_at", "created_at", "updated_at"
    );
    private static final List<String> OPERATION_COLUMNS = List.of(
            "parking_lot_id", "base_free_minutes", "base_minutes", "base_fee", "additional_minutes",
            "additional_fee", "daily_max_fee", "monthly_fee", "weekday_paid", "saturday_paid", "holiday_paid",
            "weekday_status", "weekday_open_time", "weekday_close_time",
            "weekend_status", "weekend_open_time", "weekend_close_time",
            "holiday_status", "holiday_open_time", "holiday_close_time",
            "source_checked_at", "created_at", "updated_at"
    );
    private static final List<String> STAGING_COLUMNS = List.of(
            "row_number", "id", "source", "source_external_id", "name", "sido", "sigungu", "address",
            "latitude", "longitude", "capacity", "mechanical", "is_public", "active", "lot_source_checked_at", "operation_id",
            "base_free_minutes", "base_minutes", "base_fee", "additional_minutes", "additional_fee",
            "daily_max_fee", "monthly_fee", "weekday_paid", "saturday_paid", "holiday_paid",
            "weekday_status", "weekday_open_time", "weekday_close_time",
            "weekend_status", "weekend_open_time", "weekend_close_time",
            "holiday_status", "holiday_open_time", "holiday_close_time", "operation_source_checked_at"
    );
    private static final String COPY_STAGING = "COPY parking_csv_staging ("
            + String.join(", ", STAGING_COLUMNS) + ") FROM STDIN (FORMAT binary)";
    private static final String COPY_KEYS = "COPY parking_csv_keys (row_number, name, address) FROM STDIN (FORMAT binary)";
    private static final String SELECT_ROWS = """
            SELECT l.id, l.source, l.source_external_id, l.name, l.sido, l.sigungu, l.address,
                   l.latitude, l.longitude, l.capacity, l.mechanical, l.is_public, l.active,
                   l.source_checked_at AS lot_source_checked_at,
                   o.parking_lot_id AS operation_id,
                   o.base_free_minutes, o.base_minutes, o.base_fee, o.additional_minutes, o.additional_fee,
                   o.daily_max_fee, o.monthly_fee, o.weekday_paid, o.saturday_paid, o.holiday_paid,
                   o.weekday_status, o.weekday_open_time, o.weekday_close_time,
                   o.weekend_status, o.weekend_open_time, o.weekend_close_time,
                   o.holiday_status, o.holiday_open_time, o.holiday_close_time,
                   o.source_checked_at AS operation_source_checked_at
            FROM parking_lots l
            LEFT JOIN parking_operations o ON o.parking_lot_id = l.id
            """;
    private static final String UPDATE_LOT = """
            UPDATE parking_lots
            SET source = :source, source_external_id = :source_external_id, name = :name,
                sido = :sido, sigungu = :sigungu, address = :address,
                latitude = :latitude, longitude = :longitude, capacity = :capacity,
                mechanical = :mechanical, is_public = :is_public, active = :active,
                source_checked_at = :source_checked_at, updated_at = :updated_at
            WHERE id = :id
            """;
    private static final String UPDATE_OPERATION = """
            UPDATE parking_operations
            SET base_free_minutes = :base_free_minutes, base_minutes = :base_minutes, base_fee = :base_fee,
                additional_minutes = :additional_minutes, additional_fee = :additional_fee,
                daily_max_fee = :daily_max_fee, monthly_fee = :monthly_fee,
                weekday_paid = :weekday_paid, saturday_paid = :saturday_paid, holiday_paid = :holiday_paid,
                weekday_status = :weekday_status, weekday_open_time = :weekday_open_time,
                weekday_close_time = :weekday_close_time,
                weekend_status = :weekend_status, weekend_open_time = :weekend_open_time,
                weekend_close_time = :weekend_close_time,
                holiday_status = :holiday_status, holiday_open_time = :holiday_open_time,
                holiday_close_time = :holiday_close_time,
                source_checked_at = :source_checked_at, updated_at = :updated_at
            WHERE parking_lot_id = :parking_lot_id
            """;
    private static final String DEACTIVATE_LOT = """
            UPDATE parking_lots SET active = FALSE, updated_at = ? WHERE id = ?
            """;
    private static final String UPDATE_STAGED_LOT = """
            UPDATE parking_lots l
            SET source = staged.source, source_external_id = staged.source_external_id,
                name = staged.name, sido = staged.sido, sigungu = staged.sigungu, address = staged.address,
                latitude = staged.latitude, longitude = staged.longitude, capacity = staged.capacity,
                mechanical = staged.mechanical, is_public = staged.is_public, active = staged.active,
                source_checked_at = staged.lot_source_checked_at, updated_at = :updated_at
            FROM parking_csv_staging staged
            JOIN parking_csv_matches matched ON matched.row_number = staged.row_number
            WHERE l.id = matched.parking_lot_id AND matched.lot_changed
              AND matched.row_number > :after_row_number AND matched.row_number <= :last_row_number
            """;
    private static final String UPDATE_STAGED_OPERATION = """
            UPDATE parking_operations o
            SET base_free_minutes = staged.base_free_minutes, base_minutes = staged.base_minutes,
                base_fee = staged.base_fee, additional_minutes = staged.additional_minutes,
                additional_fee = staged.additional_fee, daily_max_fee = staged.daily_max_fee,
                monthly_fee = staged.monthly_fee, weekday_paid = staged.weekday_paid,
                saturday_paid = staged.saturday_paid, holiday_paid = staged.holiday_paid,
                weekday_status = staged.weekday_status, weekday_open_time = staged.weekday_open_time,
                weekday_close_time = staged.weekday_close_time,
                weekend_status = staged.weekend_status, weekend_open_time = staged.weekend_open_time,
                weekend_close_time = staged.weekend_close_time,
                holiday_status = staged.holiday_status, holiday_open_time = staged.holiday_open_time,
                holiday_close_time = staged.holiday_close_time,
                source_checked_at = staged.operation_source_checked_at, updated_at = :updated_at
            FROM parking_csv_staging staged
            JOIN parking_csv_matches matched ON matched.row_number = staged.row_number
            WHERE o.parking_lot_id = matched.parking_lot_id
              AND matched.operation_changed AND NOT matched.operation_missing
              AND matched.row_number > :after_row_number AND matched.row_number <= :last_row_number
            """;
    private static final String INSERT_STAGED_OPERATION = """
            INSERT INTO parking_operations (
                parking_lot_id, base_free_minutes, base_minutes, base_fee, additional_minutes,
                additional_fee, daily_max_fee, monthly_fee, weekday_paid, saturday_paid, holiday_paid,
                weekday_status, weekday_open_time, weekday_close_time,
                weekend_status, weekend_open_time, weekend_close_time,
                holiday_status, holiday_open_time, holiday_close_time,
                source_checked_at, created_at, updated_at
            )
            SELECT matched.parking_lot_id, staged.base_free_minutes, staged.base_minutes, staged.base_fee,
                   staged.additional_minutes, staged.additional_fee, staged.daily_max_fee, staged.monthly_fee,
                   staged.weekday_paid, staged.saturday_paid, staged.holiday_paid,
                   staged.weekday_status, staged.weekday_open_time, staged.weekday_close_time,
                   staged.weekend_status, staged.weekend_open_time, staged.weekend_close_time,
                   staged.holiday_status, staged.holiday_open_time, staged.holiday_close_time,
                   staged.operation_source_checked_at, :updated_at, :updated_at
            FROM parking_csv_staging staged
            JOIN parking_csv_matches matched ON matched.row_number = staged.row_number
            WHERE matched.operation_missing
              AND matched.row_number > :after_row_number AND matched.row_number <= :last_row_number
            """;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public boolean tryAcquireLock() {
        requireTransaction();
        Boolean locked = jdbcTemplate.queryForObject(
                "SELECT pg_try_advisory_xact_lock(:lock_key)",
                new MapSqlParameterSource("lock_key", IMPORT_LOCK_KEY),
                Boolean.class
        );
        return Boolean.TRUE.equals(locked);
    }

    public void createStaging() {
        requireTransaction();
        jdbcTemplate.getJdbcTemplate().execute("""
                CREATE TEMP TABLE parking_csv_staging ON COMMIT DROP AS
                SELECT 0::BIGINT AS row_number, source_rows.* FROM (
                """ + SELECT_ROWS + ") source_rows WITH NO DATA");
        jdbcTemplate.getJdbcTemplate().execute(
                "ALTER TABLE parking_csv_staging ADD PRIMARY KEY (row_number)"
        );
        jdbcTemplate.getJdbcTemplate().execute("""
                CREATE TEMP TABLE parking_csv_keys (
                    row_number BIGINT PRIMARY KEY,
                    name BYTEA,
                    address BYTEA
                ) ON COMMIT DROP
                """);
    }

    public void stageRows(List<ParkingCsvRow> rows) {
        requireTransaction();
        requireStagingBatchSize(rows.size());
        if (rows.isEmpty()) {
            return;
        }
        jdbcTemplate.getJdbcTemplate().execute((ConnectionCallback<Void>) connection -> {
            ParkingCsvStagingWriter.copyRows(connection, COPY_STAGING, rows);
            return null;
        });
    }

    public void stageKeys(List<ParkingCsvKey> keys) {
        requireTransaction();
        requireStagingBatchSize(keys.size());
        if (keys.isEmpty()) {
            return;
        }
        jdbcTemplate.getJdbcTemplate().execute((ConnectionCallback<Void>) connection -> {
            ParkingCsvStagingWriter.copyKeys(connection, COPY_KEYS, keys);
            return null;
        });
    }

    public List<Long> findDuplicateRowNumbers() {
        requireTransaction();
        return jdbcTemplate.queryForList("""
                SELECT row_number
                FROM (
                    SELECT row_number,
                           COUNT(*) OVER (PARTITION BY name, address) AS key_count,
                           MIN(row_number) OVER (PARTITION BY name, address) AS first_row
                    FROM (
                        SELECT row_number, convert_to(name, 'UTF8') AS name,
                               convert_to(address, 'UTF8') AS address
                        FROM parking_csv_staging
                        UNION ALL
                        SELECT invalid.row_number, invalid.name, invalid.address
                        FROM parking_csv_keys invalid
                        WHERE NOT EXISTS (
                            SELECT 1 FROM parking_csv_staging valid
                            WHERE valid.row_number = invalid.row_number
                        )
                    ) all_keys
                ) keys
                WHERE key_count > 1
                ORDER BY first_row, row_number
                """, new MapSqlParameterSource(), Long.class);
    }

    public void prepareStaging() {
        requireTransaction();
        jdbcTemplate.getJdbcTemplate().execute("ANALYZE parking_csv_staging");
    }

    public void matchStagedRows() {
        requireTransaction();
        validateStoredSources();
        // 유한한 CSV 시각이 pgjdbc에서 무한대로 저장된 경우에도 기존 Java 값 비교 결과를 유지한다.
        jdbcTemplate.getJdbcTemplate().execute("""
                CREATE TEMP TABLE parking_csv_matches ON COMMIT DROP AS
                SELECT staged.row_number, l.id AS parking_lot_id,
                       l.active AS old_active, staged.active AS new_active,
                       NOT isfinite(staged.lot_source_checked_at) OR
                       ROW(NULLIF(btrim(l.source), ''), NULLIF(btrim(l.source_external_id), ''),
                           NULLIF(btrim(l.name), ''), NULLIF(btrim(l.sido), ''),
                           NULLIF(btrim(l.sigungu), ''), NULLIF(btrim(l.address), ''),
                           l.latitude, l.longitude, l.capacity, l.mechanical, l.is_public, l.active, l.source_checked_at)
                       IS DISTINCT FROM
                       ROW(staged.source, staged.source_external_id, staged.name, staged.sido,
                           staged.sigungu, staged.address, staged.latitude, staged.longitude,
                           staged.capacity, staged.mechanical, staged.is_public, staged.active, staged.lot_source_checked_at)
                       AS lot_changed,
                       ROW(l.latitude, l.longitude) IS DISTINCT FROM ROW(staged.latitude, staged.longitude)
                           AS coordinates_changed,
                       o.parking_lot_id IS NULL AS operation_missing,
                       o.parking_lot_id IS NULL OR NOT isfinite(staged.operation_source_checked_at) OR
                       ROW(o.base_free_minutes, o.base_minutes, o.base_fee, o.additional_minutes,
                           o.additional_fee, o.daily_max_fee, o.monthly_fee,
                           o.weekday_paid, o.saturday_paid, o.holiday_paid,
                           NULLIF(btrim(o.weekday_status), ''), o.weekday_open_time, o.weekday_close_time,
                           NULLIF(btrim(o.weekend_status), ''), o.weekend_open_time, o.weekend_close_time,
                           NULLIF(btrim(o.holiday_status), ''), o.holiday_open_time, o.holiday_close_time,
                           o.source_checked_at)
                       IS DISTINCT FROM
                       ROW(staged.base_free_minutes, staged.base_minutes, staged.base_fee,
                           staged.additional_minutes, staged.additional_fee, staged.daily_max_fee, staged.monthly_fee,
                           staged.weekday_paid, staged.saturday_paid, staged.holiday_paid,
                           staged.weekday_status, staged.weekday_open_time, staged.weekday_close_time,
                           staged.weekend_status, staged.weekend_open_time, staged.weekend_close_time,
                           staged.holiday_status, staged.holiday_open_time, staged.holiday_close_time,
                           staged.operation_source_checked_at)
                       AS operation_changed
                FROM parking_csv_staging staged
                JOIN parking_lots l
                  ON NULLIF(btrim(l.name), '') = staged.name
                 AND NULLIF(btrim(l.address), '') = staged.address
                LEFT JOIN parking_operations o ON o.parking_lot_id = l.id
                """);
        jdbcTemplate.getJdbcTemplate().execute(
                "ALTER TABLE parking_csv_matches ADD PRIMARY KEY (row_number)"
        );
        jdbcTemplate.getJdbcTemplate().execute(
                "CREATE INDEX parking_csv_matches_lot_id ON parking_csv_matches (parking_lot_id)"
        );
        jdbcTemplate.getJdbcTemplate().execute("ANALYZE parking_csv_matches");
    }

    private void validateStoredSources() {
        List<String> sources = new ArrayList<>();
        for (ParkingDataSource source : ParkingDataSource.values()) {
            sources.add(source.name());
        }
        Boolean invalidSource = jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM parking_lots l
                    WHERE NULLIF(btrim(l.source), '') IS NULL
                       OR NULLIF(btrim(l.source), '') NOT IN (:sources)
                )
                """, new MapSqlParameterSource("sources", sources), Boolean.class);
        if (Boolean.TRUE.equals(invalidSource)) {
            throw new IllegalArgumentException("DB 주차장 출처 값이 올바르지 않습니다.");
        }
    }

    public ParkingCsvBatch findStagedBatchMetadata(long afterRowNumber, int limit) {
        requireTransaction();
        requirePositiveLimit(limit);
        return jdbcTemplate.queryForObject("""
                WITH batch AS (
                    SELECT row_number FROM parking_csv_staging
                    WHERE row_number > :after_row_number ORDER BY row_number LIMIT :limit
                )
                SELECT COUNT(*) AS row_count, COALESCE(MAX(batch.row_number), :after_row_number) AS last_row_number,
                       COUNT(*) FILTER (WHERE matched.lot_changed) AS lot_update_count,
                       COUNT(*) FILTER (WHERE matched.coordinates_changed) AS coordinates_update_count,
                       COUNT(*) FILTER (WHERE matched.operation_changed AND NOT matched.operation_missing)
                           AS operation_update_count,
                       COUNT(*) FILTER (WHERE matched.operation_missing) AS operation_insert_count,
                       COUNT(*) FILTER (WHERE matched.row_number IS NULL) AS added_count,
                       COUNT(*) FILTER (WHERE (matched.lot_changed OR matched.operation_changed)
                                              AND matched.old_active = matched.new_active) AS updated_count,
                       COUNT(*) FILTER (WHERE NOT matched.old_active AND matched.new_active) AS reactivated_count,
                       COUNT(*) FILTER (WHERE matched.old_active AND NOT matched.new_active) AS deactivated_count,
                       COUNT(*) FILTER (WHERE NOT matched.lot_changed AND NOT matched.operation_changed)
                           AS unchanged_count
                FROM batch LEFT JOIN parking_csv_matches matched ON matched.row_number = batch.row_number
                """, new MapSqlParameterSource()
                .addValue("after_row_number", afterRowNumber, Types.BIGINT)
                .addValue("limit", limit, Types.INTEGER), (resultSet, rowNumber) -> new ParkingCsvBatch(
                resultSet.getInt("row_count"), resultSet.getLong("last_row_number"),
                resultSet.getInt("lot_update_count"), resultSet.getInt("operation_update_count"),
                resultSet.getInt("operation_insert_count"), resultSet.getInt("coordinates_update_count"),
                new ParkingSyncSummary(
                        resultSet.getInt("added_count"), resultSet.getInt("updated_count"),
                        resultSet.getInt("reactivated_count"), resultSet.getInt("deactivated_count"),
                        resultSet.getInt("unchanged_count")
                )
        ));
    }

    public List<ParkingCsvRow> findUnmatchedStagedRows(long afterRowNumber, long lastRowNumber) {
        requireTransaction();
        return jdbcTemplate.query("""
                SELECT staged.* FROM parking_csv_staging staged
                WHERE staged.row_number > :after_row_number AND staged.row_number <= :last_row_number
                  AND NOT EXISTS (
                      SELECT 1 FROM parking_csv_matches matched WHERE matched.row_number = staged.row_number
                  )
                ORDER BY staged.row_number
                """, stagingRangeParameters(afterRowNumber, lastRowNumber), (resultSet, rowNumber) -> {
                    ParkingDbRow row = readRow(resultSet, rowNumber);
                    return new ParkingCsvRow(resultSet.getLong("row_number"), row.lot(), row.operation());
                });
    }

    public void applyMatchedStagedBatch(long afterRowNumber, ParkingCsvBatch batch, Instant now) {
        requireTransaction();
        MapSqlParameterSource parameters = stagingRangeParameters(afterRowNumber, batch.lastRowNumber())
                .addValue("updated_at", now.atOffset(ZoneOffset.UTC), Types.TIMESTAMP_WITH_TIMEZONE);
        updateStagedRows(UPDATE_STAGED_LOT, parameters, batch.lotUpdateCount());
        updateStagedRows(UPDATE_STAGED_OPERATION, parameters, batch.operationUpdateCount());
        updateStagedRows(INSERT_STAGED_OPERATION, parameters, batch.operationInsertCount());
        if (batch.coordinatesUpdateCount() > 0) {
            jdbcTemplate.queryForObject("""
                    SELECT refresh_parking_lot_walking_nodes(ARRAY(
                        SELECT parking_lot_id FROM parking_csv_matches
                        WHERE coordinates_changed
                          AND row_number > :after_row_number AND row_number <= :last_row_number
                    )::BIGINT[])
                    """, parameters, Long.class);
        }
    }

    private MapSqlParameterSource stagingRangeParameters(long afterRowNumber, long lastRowNumber) {
        return new MapSqlParameterSource()
                .addValue("after_row_number", afterRowNumber, Types.BIGINT)
                .addValue("last_row_number", lastRowNumber, Types.BIGINT);
    }

    private void updateStagedRows(String sql, MapSqlParameterSource parameters, int expectedCount) {
        if (expectedCount == 0) {
            return;
        }
        if (jdbcTemplate.update(sql, parameters) != expectedCount) {
            throw new IllegalStateException("비교한 주차장 데이터를 갱신할 수 없습니다.");
        }
    }

    public List<ParkingDbRow> findMissingStagedBatch(Long afterId, long maxId, int limit) {
        requireTransaction();
        requirePositiveLimit(limit);
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("max_id", maxId, Types.BIGINT)
                .addValue("limit", limit, Types.INTEGER);
        String sql = SELECT_ROWS + """
                WHERE l.active = TRUE AND l.id <= :max_id
                  AND NOT EXISTS (
                      SELECT 1 FROM parking_csv_matches matched
                      WHERE matched.parking_lot_id = l.id
                  )
                """;
        if (afterId != null) {
            sql += " AND l.id > :after_id";
            parameters.addValue("after_id", afterId, Types.BIGINT);
        }
        return jdbcTemplate.query(sql + " ORDER BY l.id LIMIT :limit", parameters, this::readRow);
    }

    public void dropStaging() {
        requireTransaction();
        jdbcTemplate.getJdbcTemplate().execute("DROP TABLE parking_csv_staging, parking_csv_keys, parking_csv_matches");
    }

    public List<ParkingDbRow> findAll() {
        return jdbcTemplate.query(SELECT_ROWS + " ORDER BY l.id", new MapSqlParameterSource(), this::readRow);
    }

    public Long findMaxId() {
        return jdbcTemplate.queryForObject("SELECT MAX(id) FROM parking_lots", new MapSqlParameterSource(), Long.class);
    }

    private void requirePositiveLimit(int limit) {
        if (limit <= 0) {
            throw new IllegalArgumentException("조회 배치 크기는 1 이상이어야 합니다.");
        }
    }

    private void requireStagingBatchSize(int size) {
        if (size > BATCH_SIZE) {
            throw new IllegalArgumentException("CSV 임시 저장 배치는 500건 이하여야 합니다.");
        }
    }

    private ParkingDbRow readRow(ResultSet resultSet, int rowNumber) throws SQLException {
        ParkingLotValues lot = new ParkingLotValues(
                ParkingDataSource.valueOf(ParkingKey.normalize(resultSet.getString("source"))),
                ParkingKey.normalize(resultSet.getString("source_external_id")),
                ParkingKey.normalize(resultSet.getString("name")),
                ParkingKey.normalize(resultSet.getString("sido")),
                ParkingKey.normalize(resultSet.getString("sigungu")),
                ParkingKey.normalize(resultSet.getString("address")),
                resultSet.getObject("latitude", Double.class),
                resultSet.getObject("longitude", Double.class),
                resultSet.getObject("capacity", Integer.class),
                resultSet.getBoolean("mechanical"),
                resultSet.getObject("is_public", Boolean.class),
                resultSet.getBoolean("active"),
                readInstant(resultSet, "lot_source_checked_at")
        );
        ParkingOperationValues operation = null;
        if (resultSet.getObject("operation_id") != null) {
            operation = readOperation(resultSet);
        }
        return new ParkingDbRow(resultSet.getLong("id"), lot, operation);
    }

    public void save(ParkingChanges changes, Instant now) {
        requireTransaction();
        insertNewParkingLots(changes.added(), now);
        List<Long> parkingLotIdsToRefresh = updateExistingParkingLots(changes.updated(), now);
        deactivateMissingParkingLots(changes.deactivated(), now);
        refreshWalkingNodeCandidates(parkingLotIdsToRefresh);
    }

    public void insertNewParkingLots(List<ParkingCsvRow> rows, Instant now) {
        requireTransaction();
        for (int offset = 0; offset < rows.size(); offset += BATCH_SIZE) {
            List<ParkingCsvRow> batch = rows.subList(offset, Math.min(offset + BATCH_SIZE, rows.size()));
            List<MapSqlParameterSource> lotParameters = new ArrayList<>();
            for (ParkingCsvRow row : batch) {
                lotParameters.add(lotParameters(row.lot(), now));
            }
            MapSqlParameterSource insertParameters = new MapSqlParameterSource();
            String sql = insertSql("parking_lots", LOT_COLUMNS, lotParameters, insertParameters)
                    + " RETURNING id, name, address";
            List<GeneratedLot> generatedLots = jdbcTemplate.query(sql, insertParameters, (resultSet, rowNumber) ->
                    new GeneratedLot(
                            resultSet.getLong("id"),
                            new ParkingKey(resultSet.getString("name"), resultSet.getString("address"))
                    )
            );
            Map<ParkingKey, Long> generatedIds = new HashMap<>();
            for (GeneratedLot lot : generatedLots) {
                generatedIds.put(lot.key(), lot.id());
            }
            List<MapSqlParameterSource> operationParameters = new ArrayList<>();
            List<Long> parkingLotIdsToRefresh = new ArrayList<>();
            for (ParkingCsvRow row : batch) {
                Long id = generatedIds.get(row.key());
                if (id == null) {
                    throw new IllegalStateException("신규 주차장의 DB 생성 ID를 확인할 수 없습니다.");
                }
                parkingLotIdsToRefresh.add(id);
                operationParameters.add(operationParameters(id, row.operation(), now));
            }
            insertOperations(operationParameters);
            refreshWalkingNodeCandidates(parkingLotIdsToRefresh);
        }
    }

    private List<Long> updateExistingParkingLots(List<ParkingUpdate> updates, Instant now) {
        List<MapSqlParameterSource> lotUpdates = new ArrayList<>();
        List<MapSqlParameterSource> operationUpdates = new ArrayList<>();
        List<MapSqlParameterSource> missingOperations = new ArrayList<>();
        List<Long> parkingLotIdsToRefresh = new ArrayList<>();
        for (ParkingUpdate update : updates) {
            long id = update.before().id();
            if (update.lotChanged()) {
                lotUpdates.add(lotParameters(update.after().lot(), now).addValue("id", id, Types.BIGINT));
            }
            if (update.coordinatesChanged()) {
                parkingLotIdsToRefresh.add(id);
            }
            if (!update.operationChanged()) {
                continue;
            }
            MapSqlParameterSource parameters = operationParameters(id, update.after().operation(), now);
            if (update.before().operation() == null) {
                missingOperations.add(parameters);
                continue;
            }
            operationUpdates.add(parameters);
        }
        batchUpdate(UPDATE_LOT, lotUpdates);
        batchUpdate(UPDATE_OPERATION, operationUpdates);
        insertOperations(missingOperations);
        return parkingLotIdsToRefresh;
    }

    private void refreshWalkingNodeCandidates(List<Long> parkingLotIds) {
        if (parkingLotIds.isEmpty()) {
            return;
        }
        jdbcTemplate.queryForObject(
                "SELECT refresh_parking_lot_walking_nodes(ARRAY[:parkingLotIds]::BIGINT[])",
                new MapSqlParameterSource("parkingLotIds", parkingLotIds),
                Long.class
        );
    }

    public void deactivateMissingParkingLots(List<ParkingDbRow> rows, Instant now) {
        requireTransaction();
        for (int offset = 0; offset < rows.size(); offset += BATCH_SIZE) {
            List<ParkingDbRow> batch = rows.subList(offset, Math.min(offset + BATCH_SIZE, rows.size()));
            deactivateParkingLotBatch(batch, now);
        }
    }

    private void deactivateParkingLotBatch(List<ParkingDbRow> rows, Instant now) {
        OffsetDateTime timestamp = now.atOffset(ZoneOffset.UTC);
        batchUpdate(DEACTIVATE_LOT, rows, (statement, row) -> {
            statement.setObject(1, timestamp, Types.TIMESTAMP_WITH_TIMEZONE);
            statement.setLong(2, row.id());
        });
    }

    private void insertOperations(List<MapSqlParameterSource> parameters) {
        for (int offset = 0; offset < parameters.size(); offset += BATCH_SIZE) {
            List<MapSqlParameterSource> batch = parameters.subList(
                    offset, Math.min(offset + BATCH_SIZE, parameters.size())
            );
            MapSqlParameterSource insertParameters = new MapSqlParameterSource();
            String sql = insertSql("parking_operations", OPERATION_COLUMNS, batch, insertParameters);
            int inserted = jdbcTemplate.update(sql, insertParameters);
            if (inserted != batch.size()) {
                throw new IllegalStateException("운영정보 저장 건수가 요청한 건수와 다릅니다.");
            }
        }
    }

    private void batchUpdate(String sql, List<MapSqlParameterSource> parameters) {
        for (int offset = 0; offset < parameters.size(); offset += BATCH_SIZE) {
            SqlParameterSource[] batch = parameters.subList(offset, Math.min(offset + BATCH_SIZE, parameters.size()))
                    .toArray(SqlParameterSource[]::new);
            for (int updated : jdbcTemplate.batchUpdate(sql, batch)) {
                if (updated != 1 && updated != Statement.SUCCESS_NO_INFO) {
                    throw new IllegalStateException("비교한 주차장 데이터를 갱신할 수 없습니다.");
                }
            }
        }
    }

    private <T> void batchUpdate(String sql, List<T> rows, ParameterizedPreparedStatementSetter<T> setter) {
        for (int offset = 0; offset < rows.size(); offset += BATCH_SIZE) {
            List<T> batch = rows.subList(offset, Math.min(offset + BATCH_SIZE, rows.size()));
            int[] counts = jdbcTemplate.getJdbcTemplate().batchUpdate(sql, new BatchPreparedStatementSetter() {
                @Override
                public void setValues(PreparedStatement statement, int index) throws SQLException {
                    setter.setValues(statement, batch.get(index));
                }

                @Override
                public int getBatchSize() {
                    return batch.size();
                }
            });
            if (counts.length != batch.size()) {
                throw new IllegalStateException("비교한 주차장 데이터를 갱신할 수 없습니다.");
            }
            for (int updated : counts) {
                if (updated != 1 && updated != Statement.SUCCESS_NO_INFO) {
                    throw new IllegalStateException("비교한 주차장 데이터를 갱신할 수 없습니다.");
                }
            }
        }
    }

    private String insertSql(
            String table,
            List<String> columns,
            List<MapSqlParameterSource> rows,
            MapSqlParameterSource parameters
    ) {
        StringJoiner values = new StringJoiner(", ");
        for (int rowIndex = 0; rowIndex < rows.size(); rowIndex++) {
            MapSqlParameterSource row = rows.get(rowIndex);
            StringJoiner rowValues = new StringJoiner(", ", "(", ")");
            for (String column : columns) {
                String parameter = column + "_" + rowIndex;
                rowValues.add(":" + parameter);
                parameters.addValue(parameter, row.getValue(column), row.getSqlType(column));
            }
            values.add(rowValues.toString());
        }
        // Table and column names come only from the constants above, never from CSV headers.
        return "INSERT INTO " + table + " (" + String.join(", ", columns) + ") VALUES " + values;
    }

    private MapSqlParameterSource lotParameters(ParkingLotValues lot, Instant now) {
        OffsetDateTime timestamp = now.atOffset(ZoneOffset.UTC);
        return new MapSqlParameterSource()
                .addValue("source", lot.source().name(), Types.VARCHAR)
                .addValue("source_external_id", lot.sourceExternalId(), Types.VARCHAR)
                .addValue("name", lot.name(), Types.VARCHAR)
                .addValue("sido", lot.sido(), Types.VARCHAR)
                .addValue("sigungu", lot.sigungu(), Types.VARCHAR)
                .addValue("address", lot.address(), Types.VARCHAR)
                .addValue("latitude", lot.latitude(), Types.DOUBLE)
                .addValue("longitude", lot.longitude(), Types.DOUBLE)
                .addValue("capacity", lot.capacity(), Types.INTEGER)
                .addValue("mechanical", lot.mechanical(), Types.BOOLEAN)
                .addValue("is_public", lot.isPublic(), Types.BOOLEAN)
                .addValue("active", lot.active(), Types.BOOLEAN)
                .addValue("source_checked_at", toDatabaseTimestamp(lot.sourceCheckedAt()), Types.TIMESTAMP_WITH_TIMEZONE)
                .addValue("created_at", timestamp, Types.TIMESTAMP_WITH_TIMEZONE)
                .addValue("updated_at", timestamp, Types.TIMESTAMP_WITH_TIMEZONE);
    }

    private MapSqlParameterSource operationParameters(long id, ParkingOperationValues operation, Instant now) {
        OffsetDateTime timestamp = now.atOffset(ZoneOffset.UTC);
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("parking_lot_id", id, Types.BIGINT)
                .addValue("base_free_minutes", operation.baseFreeMinutes(), Types.INTEGER)
                .addValue("base_minutes", operation.baseMinutes(), Types.INTEGER)
                .addValue("base_fee", operation.baseFee(), Types.INTEGER)
                .addValue("additional_minutes", operation.additionalMinutes(), Types.INTEGER)
                .addValue("additional_fee", operation.additionalFee(), Types.INTEGER)
                .addValue("daily_max_fee", operation.dailyMaxFee(), Types.INTEGER)
                .addValue("monthly_fee", operation.monthlyFee(), Types.INTEGER)
                .addValue("weekday_paid", operation.weekdayPaid(), Types.BOOLEAN)
                .addValue("saturday_paid", operation.saturdayPaid(), Types.BOOLEAN)
                .addValue("holiday_paid", operation.holidayPaid(), Types.BOOLEAN)
                .addValue("source_checked_at", toDatabaseTimestamp(operation.sourceCheckedAt()), Types.TIMESTAMP_WITH_TIMEZONE)
                .addValue("created_at", timestamp, Types.TIMESTAMP_WITH_TIMEZONE)
                .addValue("updated_at", timestamp, Types.TIMESTAMP_WITH_TIMEZONE);
        addSchedule(parameters, "weekday", operation.weekday());
        addSchedule(parameters, "weekend", operation.weekend());
        addSchedule(parameters, "holiday", operation.holiday());
        return parameters;
    }

    private OffsetDateTime toDatabaseTimestamp(Instant value) {
        // 임시 테이블에서 읽은 JDBC 무한대 값은 UTC로 변환하면 날짜 범위를 벗어난다.
        if (value.equals(NEGATIVE_INFINITY)) {
            return OffsetDateTime.MIN;
        }
        if (value.equals(POSITIVE_INFINITY)) {
            return OffsetDateTime.MAX;
        }
        return value.atOffset(ZoneOffset.UTC);
    }

    private void addSchedule(MapSqlParameterSource parameters, String prefix, ParkingScheduleValues schedule) {
        String status = null;
        if (schedule.status() != null) {
            status = schedule.status().name();
        }
        parameters.addValue(prefix + "_status", status, Types.VARCHAR);
        parameters.addValue(prefix + "_open_time", schedule.openTime(), Types.TIME);
        parameters.addValue(prefix + "_close_time", schedule.closeTime(), Types.TIME);
    }

    private ParkingOperationValues readOperation(ResultSet resultSet) throws SQLException {
        return new ParkingOperationValues(
                resultSet.getObject("base_free_minutes", Integer.class),
                resultSet.getObject("base_minutes", Integer.class),
                resultSet.getObject("base_fee", Integer.class),
                resultSet.getObject("additional_minutes", Integer.class),
                resultSet.getObject("additional_fee", Integer.class),
                resultSet.getObject("daily_max_fee", Integer.class),
                resultSet.getObject("monthly_fee", Integer.class),
                resultSet.getObject("weekday_paid", Boolean.class),
                resultSet.getObject("saturday_paid", Boolean.class),
                resultSet.getObject("holiday_paid", Boolean.class),
                readSchedule(resultSet, "weekday"),
                readSchedule(resultSet, "weekend"),
                readSchedule(resultSet, "holiday"),
                readInstant(resultSet, "operation_source_checked_at")
        );
    }

    private ParkingScheduleValues readSchedule(ResultSet resultSet, String prefix) throws SQLException {
        String value = ParkingKey.normalize(resultSet.getString(prefix + "_status"));
        ParkingOperationStatus status = null;
        if (value != null) {
            status = ParkingOperationStatus.valueOf(value);
        }
        return new ParkingScheduleValues(
                status,
                resultSet.getObject(prefix + "_open_time", LocalTime.class),
                resultSet.getObject(prefix + "_close_time", LocalTime.class)
        );
    }

    private Instant readInstant(ResultSet resultSet, String column) throws SQLException {
        return resultSet.getObject(column, OffsetDateTime.class).toInstant();
    }

    private void requireTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("CSV 동기화 잠금과 저장은 같은 트랜잭션에서 실행해야 합니다.");
        }
    }

    private record GeneratedLot(long id, ParkingKey key) {
    }
}
