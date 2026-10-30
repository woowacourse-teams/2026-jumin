package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicLong;
import jumin.TestcontainersConfiguration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ViewportWriterIntegrationTest {
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private ViewportWriteCoordinator writer;
    @Autowired private ViewportMappingStateRepository states;
    @Autowired private ViewportSquareGrid grid;

    @BeforeEach
    void reset() {
        jdbc.update("UPDATE parking_viewport_cache_state SET projection_ready=FALSE, grid_size_meters=1000 WHERE id=1");
        jdbc.execute("TRUNCATE parking_lots RESTART IDENTITY CASCADE");
    }

    @Test
    @DisplayName("초기 준비는 비활성 행도 매핑하고 투영 범위 밖의 좌표는 제외한다")
    void maps_existing_rows_including_inactive_rows() {
        long inactive = insert(37.5, 127, false);
        long polar = insert(89, 127, true);

        ViewportMappingState state = writer.prepare();

        assertThat(state.ready()).isTrue();
        assertThat(cell(inactive)).isEqualTo(grid.cellId(37.5, 127, 1000));
        assertThat(cell(polar)).isNull();
    }

    @Test
    @DisplayName("좌표 이동과 셀 매핑을 같은 트랜잭션에서 갱신한다")
    void updates_mapping_with_source_coordinates() {
        long id = insert(37.5, 127, true);
        writer.prepare();

        tx().executeWithoutResult(status -> {
            ViewportMappingState before = writer.beforeSourceWrite();
            jdbc.update("UPDATE parking_lots SET latitude=37.52, longitude=127.02 WHERE id=?", id);
            writer.afterSourceWrite(before);
        });

        assertThat(cell(id)).isEqualTo(grid.cellId(37.52, 127.02, 1000));
        assertThat(states.read().ready()).isTrue();
    }

    @Test
    @DisplayName("원본 변경이 롤백되면 셀 매핑 변경도 함께 롤백된다")
    void rolls_back_mapping_with_source_changes() {
        long id = insert(37.5, 127, true);
        writer.prepare();
        Long beforeCell = cell(id);

        assertThatThrownBy(() -> tx().executeWithoutResult(status -> {
            ViewportMappingState before = writer.beforeSourceWrite();
            jdbc.update("UPDATE parking_lots SET latitude=37.52, longitude=127.02 WHERE id=?", id);
            writer.afterSourceWrite(before);
            throw new IllegalStateException("rollback fixture");
        })).isInstanceOf(IllegalStateException.class);

        assertThat(cell(id)).isEqualTo(beforeCell);
        assertThat(jdbc.queryForObject("SELECT latitude FROM parking_lots WHERE id=?", Double.class, id)).isEqualTo(37.5);
    }

    @Test
    @DisplayName("매핑 준비 뒤에도 별도 쓰기 프로토콜 없이 일반 데이터 갱신이 허용된다")
    void permits_ordinary_writes_without_protocol_trigger() {
        long id = insert(37.5, 127, true);
        writer.prepare();

        int updated = jdbc.update("UPDATE parking_lots SET capacity=123 WHERE id=?", id);

        assertThat(updated).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT capacity FROM parking_lots WHERE id=?", Integer.class, id)).isEqualTo(123);
    }

    @Test
    @DisplayName("REPEATABLE READ에서는 초기 매핑 준비를 거절한다")
    void rejects_stale_snapshot_isolation() {
        TransactionTemplate repeatable = tx();
        repeatable.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);

        assertThatThrownBy(() -> repeatable.execute(status -> writer.prepare()))
                .isInstanceOf(IllegalTransactionStateException.class);
        assertThat(states.read().ready()).isFalse();
    }

    @Test
    @DisplayName("준비 전에 진행 중이던 삽입이 커밋되면 새 행까지 매핑한다")
    void waits_for_inflight_source_writer() throws Exception {
        CountDownLatch inserted = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch preparing = new CountDownLatch(1);
        AtomicLong id = new AtomicLong();
        try (var threads = Executors.newVirtualThreadPerTaskExecutor()) {
            var source = CompletableFuture.runAsync(() -> tx().executeWithoutResult(status -> {
                id.set(insert(37.5, 127, true));
                inserted.countDown();
                try {
                    if (!release.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("release timeout");
                } catch (InterruptedException failure) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(failure);
                }
            }), threads);
            assertThat(inserted.await(5, TimeUnit.SECONDS)).isTrue();
            var prepared = CompletableFuture.supplyAsync(() -> {
                preparing.countDown();
                return writer.prepare();
            }, threads);
            assertThat(preparing.await(5, TimeUnit.SECONDS)).isTrue();
            try {
                assertThatThrownBy(() -> prepared.get(100, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
                release.countDown();
                source.get(5, TimeUnit.SECONDS);
                assertThat(prepared.get(5, TimeUnit.SECONDS).ready()).isTrue();
                assertThat(cell(id.get())).isEqualTo(grid.cellId(37.5, 127, 1000));
            } finally {
                release.countDown();
            }
        }
    }

    private long insert(double latitude, double longitude, boolean active) {
        return jdbc.queryForObject("""
                INSERT INTO parking_lots (source,source_external_id,name,address,latitude,longitude,
                    capacity,active,source_checked_at,created_at,updated_at)
                VALUES ('DATA_GO_KR',?,?,'test',?,?,50,?,NOW(),NOW(),NOW()) RETURNING id
                """, Long.class, UUID.randomUUID().toString(), "test-" + UUID.randomUUID(), latitude, longitude, active);
    }

    private Long cell(long id) {
        return jdbc.queryForObject("SELECT viewport_grid_cell FROM parking_lots WHERE id=?", Long.class, id);
    }

    private TransactionTemplate tx() {
        return new TransactionTemplate(transactions);
    }
}
