package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.zaxxer.hikari.HikariDataSource;
import javax.sql.DataSource;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import jumin.TestcontainersConfiguration;
import jumin.config.ViewportCacheProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ViewportWriterIntegrationTest {

    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private PlatformTransactionManager transactionManager;
    @Autowired
    private ViewportWriteCoordinator writer;
    @Autowired
    private ViewportVersionRepository versions;
    @Autowired
    private ViewportSquareGrid grid;
    @Autowired
    private DataSource primary;

    @Test
    @DisplayName("기존 REPEATABLE READ transaction 참여를 거절하고 준비 상태를 변경하지 않는다")
    void rejects_repeatable_read_prepare() {
        // given
        insert(true);
        ViewportVersion before = versions.read();
        TransactionTemplate repeatable = tx();
        repeatable.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);

        // when & then
        assertThatThrownBy(() -> repeatable.execute(status -> writer.prepare()))
                .isInstanceOf(IllegalTransactionStateException.class);
        assertThat(versions.read()).isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM parking_lots WHERE viewport_grid_cell IS NULL", Long.class))
                .isEqualTo(1);
    }

    @Test
    @DisplayName("URL에 writer 인증정보가 있어도 전용 pool은 실제 read 계정과 timeout으로 접속한다")
    void replaces_url_credentials_in_real_connection() throws Exception {
        // given
        HikariDataSource live = (HikariDataSource) primary;
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setReadUsername("jumin_viewport_read");
        properties.setReadPassword("viewport-cache-read-only");
        try (HikariDataSource configuration = new HikariDataSource()) {
            String separator = live.getJdbcUrl().contains("?") ? "&" : "?";
            configuration.setJdbcUrl(live.getJdbcUrl() + separator
                    + "user=jumin&password=jumin&socketTimeout=90&loginTimeout=90&options=-c%20statement_timeout%3D0");
            configuration.setUsername("jumin");
            configuration.setPassword("jumin");

            // when
            try (HikariDataSource reader = new HikariDataSource(ViewportReadPoolConfiguration.create(configuration, properties))) {
                JdbcTemplate probe = new JdbcTemplate(reader);

                // then
                assertThat(probe.queryForObject("SELECT current_user", String.class)).isEqualTo("jumin_viewport_read");
                assertThat(probe.queryForObject("SHOW statement_timeout", String.class)).isEqualTo("1s");
                assertThat(probe.queryForObject("SHOW idle_session_timeout", String.class)).isEqualTo("5s");
                assertThat(reader.getDataSourceProperties().getProperty("loginTimeout")).isEqualTo("0");
                assertThat(configuration.getJdbcUrl()).contains("socketTimeout=90", "user=jumin");
            }
        }
    }

    @BeforeEach
    void resetDataset() {
        tx().executeWithoutResult(status -> {
            jdbc.update("""
                    INSERT INTO parking_viewport_cache_state VALUES (1, ?, 0, 1000, FALSE)
                    ON CONFLICT (id) DO UPDATE SET dataset_epoch = EXCLUDED.dataset_epoch,
                    revision = 0, grid_size_meters = 1000, projection_ready = FALSE
                    """, UUID.randomUUID());
            jdbc.execute("TRUNCATE parking_lots RESTART IDENTITY CASCADE");
        });
    }

    @Test
    @DisplayName("투영 범위 밖의 정상 극지 좌표는 매핑 NULL로 두고 국내 캐시 준비를 막지 않는다")
    void leaves_unprojectable_polar_rows_unmapped() {
        long id = insert(true);
        jdbc.update("UPDATE parking_lots SET latitude=89, longitude=127 WHERE id=?", id);

        assertThat(writer.prepare().ready()).isTrue();
        assertThat(jdbc.queryForObject("SELECT viewport_grid_cell FROM parking_lots WHERE id=?", Long.class, id))
                .isNull();
        assertThat(jdbc.queryForObject("SELECT ST_Y(location::geometry) FROM parking_lots WHERE id=?", Double.class, id))
                .isEqualTo(89);
    }

    @Test
    @DisplayName("비활성 행도 backfill하고 좌표 불변 재활성화의 사각형 매핑와 버전을 같은 commit에 반영한다")
    void maps_inactive_rows_and_reactivation_atomically() {
        // given
        long id = insert(false);
        ViewportVersion before = writer.prepare();
        long cell = jdbc.queryForObject("SELECT viewport_grid_cell FROM parking_lots WHERE id = ?", Long.class, id);

        // when
        tx().executeWithoutResult(status -> {
            ViewportVersion ticket = writer.beforeSourceWrite();
            jdbc.update("UPDATE parking_lots SET active = TRUE, viewport_grid_cell = NULL WHERE id = ?", id);
            writer.afterSourceWrite(ticket);
        });

        // then
        assertThat(versions.read().ready()).isTrue();
        assertThat(versions.read().revision()).isEqualTo(before.revision() + 1);
        assertThat(jdbc.queryForObject("SELECT viewport_grid_cell FROM parking_lots WHERE id = ?", Long.class, id))
                .isEqualTo(cell);
    }

    @Test
    @DisplayName("source와 요금과 좌표를 여러 번 변경해도 commit 버전은 한 번만 증가한다")
    void publishes_one_revision_for_multiple_projection_changes() {
        // given
        long id = insert(true);
        ViewportVersion before = writer.prepare();

        // when
        tx().executeWithoutResult(status -> {
            ViewportVersion ticket = writer.beforeSourceWrite();
            jdbc.update("UPDATE parking_lots SET latitude = 37.51, longitude = 127.01, capacity = 99 WHERE id = ?", id);
            jdbc.update("UPDATE parking_operations SET weekday_paid = FALSE WHERE parking_lot_id = ?", id);
            writer.afterSourceWrite(ticket);
        });

        // then
        assertThat(versions.read().revision()).isEqualTo(before.revision() + 1);
        assertThat(jdbc.queryForObject("SELECT viewport_grid_cell FROM parking_lots WHERE id = ?", Long.class, id))
                .isEqualTo(grid.cellId(37.51, 127.01, 1000));
        assertThat(jdbc.queryForObject("SELECT ST_X(location::geometry) FROM parking_lots WHERE id = ?", Double.class, id))
                .isEqualTo(127.01);
    }

    @Test
    @DisplayName("infinity를 포함한 source 반영 시각만 바뀌면 viewport 버전을 유지한다")
    void ignores_non_projection_timestamp_changes() {
        // given
        long id = insert(true);
        ViewportVersion before = writer.prepare();

        // when
        tx().executeWithoutResult(status -> {
            ViewportVersion ticket = writer.beforeSourceWrite();
            jdbc.update("UPDATE parking_lots SET source_checked_at = 'infinity' WHERE id = ?", id);
            jdbc.update("UPDATE parking_operations SET source_checked_at = 'infinity' WHERE parking_lot_id = ?", id);
            writer.afterSourceWrite(ticket);
        });

        // then
        assertThat(versions.read()).isEqualTo(before);
    }

    @Test
    @DisplayName("버전 UPDATE가 0행이면 앞서 변경한 source와 metadata 삭제까지 전부 롤백한다")
    void rolls_back_source_when_metadata_disappears() {
        // given
        long id = insert(true);
        ViewportVersion before = writer.prepare();

        // when & then
        assertThatThrownBy(() -> tx().executeWithoutResult(status -> {
            ViewportVersion ticket = writer.beforeSourceWrite();
            jdbc.update("UPDATE parking_lots SET capacity = 99 WHERE id = ?", id);
            jdbc.update("DELETE FROM parking_viewport_cache_state");
            writer.afterSourceWrite(ticket);
        })).isInstanceOf(DataAccessException.class).hasRootCauseInstanceOf(IllegalStateException.class);
        assertThat(versions.read()).isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT capacity FROM parking_lots WHERE id = ?", Integer.class, id))
                .isEqualTo(50);
    }

    @Test
    @DisplayName("그리드 계산 실패는 source와 사각형 매핑과 revision을 모두 롤백한다")
    void rolls_back_source_on_grid_failure() {
        // given
        long id = insert(true);
        ViewportVersion before = writer.prepare();
        ViewportSquareGrid unavailable = new ViewportSquareGrid() {
            @Override
            public long cellId(double latitude, double longitude, int sizeMeters) {
                throw new IllegalStateException("injected grid calculation failure");
            }
        };
        ViewportWriteCoordinator broken = new ViewportWriteCoordinator(jdbc, versions,
                new ViewportMappingMaintainer(jdbc, unavailable), new ViewportCacheProperties());

        // when & then
        assertThatThrownBy(() -> tx().executeWithoutResult(status -> {
            ViewportVersion ticket = broken.beforeSourceWrite();
            jdbc.update("UPDATE parking_lots SET capacity = 99 WHERE id = ?", id);
            broken.afterSourceWrite(ticket);
        })).isInstanceOf(IllegalStateException.class);
        assertThat(versions.read()).isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT capacity FROM parking_lots WHERE id = ?", Integer.class, id))
                .isEqualTo(50);
    }

    @Test
    @DisplayName("일반 writer는 운영 fencing의 ready=false를 유지하고 준비 전에는 source만 갱신한다")
    void ordinary_writer_cannot_reactivate_fenced_cache() {
        // given
        long id = insert(true);
        ViewportCacheProperties enabled = new ViewportCacheProperties();
        enabled.setEnabled(true);
        ViewportWriteCoordinator activeWriter = new ViewportWriteCoordinator(jdbc, versions,
                new ViewportMappingMaintainer(jdbc, grid), enabled);

        // when
        tx().executeWithoutResult(status -> {
            ViewportVersion ticket = activeWriter.beforeSourceWrite();
            jdbc.update("UPDATE parking_lots SET capacity = 99 WHERE id = ?", id);
            activeWriter.afterSourceWrite(ticket);
        });

        // then
        assertThat(versions.read().ready()).isFalse();
        assertThat(jdbc.queryForObject("SELECT viewport_grid_cell FROM parking_lots WHERE id = ?", Long.class, id))
                .isNull();
        assertThat(writer.prepare().ready()).isTrue();
    }

    @Test
    @DisplayName("cache 준비 후 프로토콜을 모르는 구 writer의 DML을 DB에서 거절한다")
    void rejects_legacy_writer_after_activation() {
        // given
        long id = insert(true);
        ViewportVersion before = writer.prepare();

        // when & then
        assertThatThrownBy(() -> tx().executeWithoutResult(status ->
                jdbc.update("UPDATE parking_lots SET capacity = 99 WHERE id = ?", id)))
                .isInstanceOf(DataAccessException.class);
        assertThat(versions.read()).isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT capacity FROM parking_lots WHERE id = ?", Integer.class, id))
                .isEqualTo(50);
    }

    @Test
    @DisplayName("구 writer의 진행 insert가 commit된 뒤 새 행까지 모두 사각형 매핑 mapping하고 준비한다")
    void waits_for_pre_activation_legacy_writer_commit() throws Exception {
        // given
        long id = insert(true);
        CountDownLatch oldWriterHolding = new CountDownLatch(1);
        CountDownLatch allowCommit = new CountDownLatch(1);
        CountDownLatch preparing = new CountDownLatch(1);
        AtomicInteger oldPid = new AtomicInteger();
        AtomicInteger preparePid = new AtomicInteger();
        AtomicLong insertedId = new AtomicLong();
        CompletableFuture<Void> old = CompletableFuture.runAsync(() -> tx().executeWithoutResult(status -> {
            oldPid.set(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class));
            jdbc.update("UPDATE parking_lots SET capacity = 99 WHERE id = ?", id);
            insertedId.set(insert(true));
            oldWriterHolding.countDown();
            await(allowCommit);
        }));
        old.whenComplete((ignored, failure) -> {
            if (failure != null) {
                oldWriterHolding.countDown();
            }
        });
        assertThat(oldWriterHolding.await(5, TimeUnit.SECONDS)).isTrue();
        if (old.isCompletedExceptionally()) {
            old.join();
        }
        CompletableFuture<ViewportVersion> prepared = CompletableFuture.supplyAsync(() -> tx().execute(status -> {
            preparePid.set(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class));
            preparing.countDown();
            return writer.prepare();
        }));

        // when
        try {
            assertThat(preparing.await(5, TimeUnit.SECONDS)).isTrue();
            long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            boolean blocked = false;
            while (!blocked && System.nanoTime() < until) {
                blocked = Boolean.TRUE.equals(jdbc.queryForObject(
                        "SELECT ? = ANY(pg_blocking_pids(?))", Boolean.class, oldPid.get(), preparePid.get()));
                if (!blocked) {
                    Thread.sleep(10);
                }
            }
            assertThat(blocked).isTrue();
        } finally {
            allowCommit.countDown();
        }

        // then
        old.get(5, TimeUnit.SECONDS);
        assertThat(prepared.get(5, TimeUnit.SECONDS).ready()).isTrue();
        assertThat(jdbc.queryForObject("SELECT capacity FROM parking_lots WHERE id = ?", Integer.class, id))
                .isEqualTo(99);
        assertThat(jdbc.queryForObject("SELECT viewport_grid_cell FROM parking_lots WHERE id = ?", Long.class, insertedId.get()))
                .isEqualTo(grid.cellId(37.5, 127, 1000));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM parking_lots WHERE viewport_grid_cell IS NULL", Long.class))
                .isZero();
    }

    private long insert(boolean active) {
        return tx().execute(status -> {
            Long id = jdbc.queryForObject("""
                    INSERT INTO parking_lots (source, source_external_id, name, address, latitude, longitude,
                    capacity, active, source_checked_at, created_at, updated_at)
                    VALUES ('DATA_GO_KR', ?, ?, 'test address', 37.5, 127,
                    50, ?, NOW(), NOW(), NOW()) RETURNING id
                    """, Long.class, UUID.randomUUID().toString(), "viewport " + UUID.randomUUID(), active);
            jdbc.update("""
                    INSERT INTO parking_operations (parking_lot_id, weekday_paid, source_checked_at, created_at, updated_at)
                    VALUES (?, TRUE, NOW(), NOW(), NOW())
                    """, id);
            return id;
        });
    }

    private TransactionTemplate tx() {
        return new TransactionTemplate(transactionManager);
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("barrier timeout");
            }
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(failure);
        }
    }
}
