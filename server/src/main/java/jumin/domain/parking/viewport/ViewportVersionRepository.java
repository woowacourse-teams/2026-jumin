package jumin.domain.parking.viewport;

import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Repository
public class ViewportVersionRepository {

    private static final String SELECT = """
            SELECT dataset_epoch, revision, grid_size_meters, projection_ready
            FROM parking_viewport_cache_state WHERE id = 1
            """;

    private final JdbcTemplate jdbc;

    public ViewportVersionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public ViewportVersion read() {
        List<ViewportVersion> versions = jdbc.query(SELECT, (rows, index) -> new ViewportVersion(
                rows.getObject("dataset_epoch", UUID.class), rows.getLong("revision"),
                rows.getInt("grid_size_meters"), rows.getBoolean("projection_ready")));
        return versions.isEmpty() ? null : versions.getFirst();
    }

    public ViewportVersion lockForWrite() {
        requireTransaction();
        List<ViewportVersion> versions = jdbc.query(SELECT + " FOR UPDATE", (rows, index) ->
                new ViewportVersion(rows.getObject("dataset_epoch", UUID.class), rows.getLong("revision"),
                        rows.getInt("grid_size_meters"), rows.getBoolean("projection_ready")));
        if (versions.size() != 1) {
            throw new IllegalStateException("viewport state 한 행을 잠그지 못해 원본 쓰기를 중단합니다.");
        }
        return versions.getFirst();
    }

    public ViewportVersion publish(ViewportVersion previous, int gridSizeMeters, boolean ready, boolean changed) {
        requireTransaction();
        boolean advance = changed || previous.gridSizeMeters() != gridSizeMeters || previous.ready() != ready;
        List<ViewportVersion> versions = jdbc.query("""
                UPDATE parking_viewport_cache_state
                SET revision = revision + ?, grid_size_meters = ?, projection_ready = ?
                WHERE id = 1 AND dataset_epoch = ? AND revision = ?
                RETURNING dataset_epoch, revision, grid_size_meters, projection_ready
                """, (rows, index) -> new ViewportVersion(rows.getObject("dataset_epoch", UUID.class),
                rows.getLong("revision"), rows.getInt("grid_size_meters"), rows.getBoolean("projection_ready")),
                advance ? 1 : 0, gridSizeMeters, ready, previous.epoch(), previous.revision());
        if (versions.size() != 1) {
            throw new IllegalStateException("viewport 버전 갱신 실패로 원본 transaction을 롤백합니다.");
        }
        return versions.getFirst();
    }

    public ViewportVersion rotateEpoch(ViewportVersion previous) {
        requireTransaction();
        UUID next = UUID.randomUUID();
        int updated = jdbc.update("""
                UPDATE parking_viewport_cache_state SET dataset_epoch = ?, revision = 0, projection_ready = FALSE
                WHERE id = 1 AND dataset_epoch = ? AND revision = ?
                """, next, previous.epoch(), previous.revision());
        if (updated != 1) {
            throw new IllegalStateException("viewport epoch 갱신에 실패했습니다.");
        }
        return new ViewportVersion(next, 0, previous.gridSizeMeters(), false);
    }

    private void requireTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
            throw new IllegalStateException("viewport writer는 공통 쓰기 transaction이 필요합니다.");
        }
    }
}
