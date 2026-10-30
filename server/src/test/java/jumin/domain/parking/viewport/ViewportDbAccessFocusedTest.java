package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.zaxxer.hikari.HikariDataSource;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.sql.Connection;
import java.sql.Statement;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import jumin.config.ViewportCacheProperties;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class ViewportDbAccessFocusedTest {

    @Test
    @DisplayName("요청이 만료돼도 실제 DB 작업 종료 전에는 슬롯을 반환하지 않는다")
    void keeps_slot_until_actual_work_finishes() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (Harness harness = new Harness(); var threads = Executors.newVirtualThreadPerTaskExecutor()) {
            var request = CompletableFuture.supplyAsync(() -> harness.db.read("source",
                    ViewportDeadline.after(Duration.ofMillis(200)), ignored -> {
                        started.countDown();
                        try {
                            if (!release.await(5, TimeUnit.SECONDS)) {
                                throw new IllegalStateException("release timeout");
                            }
                        } catch (InterruptedException failure) {
                            Thread.currentThread().interrupt();
                            throw new IllegalStateException(failure);
                        }
                        return 1;
                    }), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> request.get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(BusinessException.class)
                    .satisfies(failure -> assertThat(((BusinessException) failure.getCause()).getErrorCode())
                            .isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE));
            var next = harness.db.readAsync("source", ViewportDeadline.after(Duration.ofSeconds(5)), ignored -> 2);

            assertThat(harness.registry.get("parking.viewport.db.active").gauge().value()).isEqualTo(1);
            assertThat(next).isNotCompleted();
            release.countDown();
            assertThat(next.get(5, TimeUnit.SECONDS)).isEqualTo(2);
            assertThat(harness.registry.get("parking.viewport.db.active").gauge().value()).isZero();
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("조회 실패 뒤 후속 요청은 영구 차단 없이 다시 실행된다")
    void failure_does_not_fence_subsequent_requests() throws Exception {
        try (Harness harness = new Harness()) {
            assertThatThrownBy(() -> harness.db.read("source", ViewportDeadline.after(Duration.ofSeconds(5)),
                    ignored -> { throw new IllegalStateException("query failed"); }))
                    .isInstanceOf(IllegalStateException.class);

            Integer result = harness.db.read("source", ViewportDeadline.after(Duration.ofSeconds(5)), ignored -> 2);
            assertThat(result).isEqualTo(2);
            assertThat(harness.registry.get("parking.viewport.db.active").gauge().value()).isZero();
        }
    }

    @Test
    @DisplayName("중단된 DB 작업의 다른 비즈니스 오류는 viewport 기한 오류로 바꾸지 않는다")
    void preserves_other_business_errors_when_db_worker_is_interrupted() throws Exception {
        try (Harness harness = new Harness()) {
            BusinessException inputFailure = new BusinessException(ErrorCode.INVALID_INPUT);
            var result = harness.db.readAsync("source", ViewportDeadline.after(Duration.ofSeconds(5)), ignored -> {
                Thread.currentThread().interrupt();
                throw inputFailure;
            });

            assertThatThrownBy(() -> result.get(5, TimeUnit.SECONDS)).hasCause(inputFailure);
        }
    }

    @Test
    @DisplayName("viewport 종료가 공유 DB 풀을 닫거나 공용 JdbcTemplate 설정을 변경하지 않는다")
    void preserves_shared_datasource_and_template_settings() throws Exception {
        Harness harness = new Harness();

        harness.db.close();

        verify(harness.pool, never()).close();
        assertThat(harness.primary.getQueryTimeout()).isEqualTo(17);
        assertThat(harness.primary.getFetchSize()).isEqualTo(32);
        harness.registry.close();
    }

    private static final class Harness implements AutoCloseable {
        private final HikariDataSource pool = mock(HikariDataSource.class);
        private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
        private final JdbcTemplate primary = new JdbcTemplate(pool);
        private final ViewportDbAccess db;

        private Harness() throws Exception {
            Connection connection = mock(Connection.class);
            when(connection.getAutoCommit()).thenReturn(true);
            when(connection.createStatement()).thenReturn(mock(Statement.class));
            when(pool.getConnection()).thenReturn(connection);
            primary.setQueryTimeout(17);
            primary.setFetchSize(32);
            ViewportCacheProperties properties = new ViewportCacheProperties();
            properties.setMaxConcurrentDb(1);
            db = new ViewportDbAccess(primary, properties, new ViewportMetrics(registry));
        }

        @Override
        public void close() {
            db.close();
            registry.close();
        }
    }
}
