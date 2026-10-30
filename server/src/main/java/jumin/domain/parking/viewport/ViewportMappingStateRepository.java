package jumin.domain.parking.viewport;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Repository
public class ViewportMappingStateRepository {

    private static final String SELECT = """
            SELECT grid_size_meters, projection_ready
            FROM parking_viewport_cache_state WHERE id = 1
            """;

    private final JdbcTemplate jdbc;

    public ViewportMappingStateRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public ViewportMappingState read() {
        List<ViewportMappingState> states = jdbc.query(SELECT, (rows, index) ->
                new ViewportMappingState(rows.getInt("grid_size_meters"), rows.getBoolean("projection_ready")));
        if (states.isEmpty()) {
            return null;
        }
        return states.getFirst();
    }

    public ViewportMappingState lockForWrite() {
        requireTransaction();
        List<ViewportMappingState> states = jdbc.query(SELECT + " FOR UPDATE", (rows, index) ->
                new ViewportMappingState(rows.getInt("grid_size_meters"), rows.getBoolean("projection_ready")));
        if (states.size() != 1) {
            throw new IllegalStateException("viewport 매핑 상태 한 행을 잠그지 못해 원본 쓰기를 중단합니다.");
        }
        return states.getFirst();
    }

    public ViewportMappingState publish(int gridSizeMeters, boolean ready) {
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
