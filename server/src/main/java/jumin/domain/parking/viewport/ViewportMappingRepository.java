package jumin.domain.parking.viewport;

import java.sql.Connection;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Repository
public class ViewportMappingRepository {

    private static final int BATCH_SIZE = 500;
    private static final String SELECT = """
            SELECT grid_size_meters, projection_ready
            FROM parking_viewport_cache_state WHERE id = 1
            """;

    private final JdbcTemplate jdbc;
    private final ViewportSquareGrid grid;

    public ViewportMappingRepository(JdbcTemplate jdbc, ViewportSquareGrid grid) {
        this.jdbc = jdbc;
        this.grid = grid;
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
        int[] counts = jdbc.batchUpdate("""
                UPDATE parking_lots SET viewport_grid_cell = ?
                WHERE id = ? AND latitude IS NOT DISTINCT FROM ?
                  AND longitude IS NOT DISTINCT FROM ?
                """, updates);
        for (int count : counts) {
            if (count != 1) {
                throw new IllegalStateException("동시 원본 변경으로 사각형 grid mapping을 검증할 수 없습니다.");
            }
        }
    }

    private List<MappingRow> findBatch(Long afterId) {
        String condition = "";
        Object[] parameters = new Object[0];
        if (afterId != null) {
            condition = "WHERE id > ?";
            parameters = new Object[]{afterId};
        }
        String sql = """
                SELECT id, latitude, longitude, viewport_grid_cell,
                       ST_X(location::geometry) AS location_longitude,
                       ST_Y(location::geometry) AS location_latitude,
                       COALESCE(ST_IsEmpty(location::geometry), TRUE) AS empty_location
                FROM parking_lots
                """ + condition + " ORDER BY id LIMIT " + BATCH_SIZE;
        return jdbc.query(sql, (rows, index) -> new MappingRow(rows.getLong("id"),
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
        jdbc.execute("LOCK TABLE parking_lots IN SHARE ROW EXCLUSIVE MODE");
    }

    private void requireReadCommitted() {
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            if (connection.getTransactionIsolation() != Connection.TRANSACTION_READ_COMMITTED) {
                throw new IllegalTransactionStateException("viewport 매핑 갱신은 READ COMMITTED가 필요합니다.");
            }
            return null;
        });
    }

    public ViewportMappingState read() {
        List<ViewportMappingState> states = jdbc.query(SELECT, (rows, index) ->
                new ViewportMappingState(rows.getInt("grid_size_meters"), rows.getBoolean("projection_ready")));
        if (states.isEmpty()) {
            return null;
        }
        return states.getFirst();
    }

    private ViewportMappingState lockStateForWrite() {
        requireTransaction();
        List<ViewportMappingState> states = jdbc.query(SELECT + " FOR UPDATE", (rows, index) ->
                new ViewportMappingState(rows.getInt("grid_size_meters"), rows.getBoolean("projection_ready")));
        if (states.size() != 1) {
            throw new IllegalStateException("viewport 매핑 상태 한 행을 잠그지 못해 원본 쓰기를 중단합니다.");
        }
        return states.getFirst();
    }

    public ViewportMappingState publishState(int gridSizeMeters, boolean ready) {
        requireTransaction();
        int updated = jdbc.update("""
                UPDATE parking_viewport_cache_state SET grid_size_meters = ?, projection_ready = ? WHERE id = 1
                """, gridSizeMeters, ready);
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
}
