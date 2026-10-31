package jumin.domain.parking.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.zaxxer.hikari.HikariDataSource;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.domain.parking.exception.ViewportFailureReason;
import jumin.domain.parking.model.ViewportBounds;
import jumin.domain.parking.model.ViewportCellKey;
import jumin.domain.parking.model.ViewportDeadline;
import jumin.domain.parking.monitoring.ViewportMetrics;
import jumin.domain.parking.service.ParkingLodScoreCalculator;
import jumin.domain.parking.service.ViewportSquareGrid;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.jdbc.core.JdbcTemplate;

class ViewportRepositoryExecutionTest {

    @Test
    @DisplayName("동기 DB 조회는 실제 종료까지 대기하고 슬롯을 유지한다")
    void keeps_slot_until_actual_work_finishes() throws Exception {
        // given
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
            // when
            Thread.sleep(250);
            var next = CompletableFuture.supplyAsync(() -> harness.db.read("source",
                    ViewportDeadline.after(Duration.ofSeconds(5)), ignored -> 2), threads);
            // then
            assertThat(request).isNotCompleted();
            assertThat(harness.registry.get("parking.viewport.db.active").gauge().value()).isEqualTo(1);
            assertThat(next).isNotCompleted();
            release.countDown();
            assertThatThrownBy(() -> request.get(5, TimeUnit.SECONDS)).hasCauseInstanceOf(BusinessException.class);
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
            // when & then
            try {
                assertThatThrownBy(() -> harness.db.read("source", ViewportDeadline.after(Duration.ofSeconds(5)), ignored -> {
                    Thread.currentThread().interrupt();
                    throw inputFailure;
                })).isSameAs(inputFailure);
            } finally {
                Thread.interrupted();
            }
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

    @Test
    @DisplayName("DB 실행과 대기 한도를 넘긴 요청만 거절하고 기존 요청은 완료한다")
    void bounds_active_and_waiting_requests() throws Exception {
        // given
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (Harness harness = new Harness(); var threads = Executors.newVirtualThreadPerTaskExecutor()) {
            var running = CompletableFuture.supplyAsync(() -> harness.db.read("source", deadline(), ignored -> {
                started.countDown();
                await(release);
                return 1;
            }), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            var waiting = CompletableFuture.supplyAsync(() -> harness.db.read("fallback", deadline(), ignored -> 2), threads);
            awaitQueued(harness, 1);
            // when & then
            assertThatThrownBy(() -> harness.db.read("source", deadline(), ignored -> 3))
                    .isInstanceOfSatisfying(BusinessException.class, failure ->
                            assertThat(failure.getReason()).isEqualTo(ViewportFailureReason.DB_QUEUE_FULL.name()));
            assertThat(harness.registry.get("parking.viewport.db.active").gauge().value()).isEqualTo(1);
            release.countDown();
            assertThat(running.get(5, TimeUnit.SECONDS)).isEqualTo(1);
            assertThat(waiting.get(5, TimeUnit.SECONDS)).isEqualTo(2);
            assertThat(harness.registry.get("parking.viewport.db.queued").gauge().value()).isZero();
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("DB 용량을 기다리다 만료된 요청은 SQL을 실행하지 않고 대기 용량을 반환한다")
    void expires_waiter_without_starting_query() throws Exception {
        // given
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger queries = new AtomicInteger();
        try (Harness harness = new Harness(); var threads = Executors.newVirtualThreadPerTaskExecutor()) {
            var running = CompletableFuture.supplyAsync(() -> harness.db.read("source", deadline(), ignored -> {
                started.countDown();
                await(release);
                return 1;
            }), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            // when & then
            assertThatThrownBy(() -> harness.db.read("fallback", ViewportDeadline.after(Duration.ofMillis(30)),
                    ignored -> queries.incrementAndGet())).isInstanceOfSatisfying(BusinessException.class,
                    failure -> assertThat(failure.getReason()).isEqualTo(ViewportFailureReason.DB_DEADLINE.name()));
            assertThat(queries).hasValue(0);
            assertThat(harness.registry.get("parking.viewport.db.queued").gauge().value()).isZero();
            release.countDown();
            assertThat(running.get(5, TimeUnit.SECONDS)).isEqualTo(1);
            Integer value = harness.db.read("source", deadline(), ignored -> 2);
            assertThat(value).isEqualTo(2);
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("종료는 대기 요청을 깨우고 실행 중인 동기 조회는 실제 종료까지 유지한다")
    void closes_waiters_without_finishing_running_query() throws Exception {
        // given
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (Harness harness = new Harness(); var threads = Executors.newVirtualThreadPerTaskExecutor()) {
            var running = CompletableFuture.supplyAsync(() -> harness.db.read("source", deadline(), ignored -> {
                started.countDown();
                await(release);
                return 1;
            }), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            var waiting = CompletableFuture.supplyAsync(() -> harness.db.read("fallback", deadline(), ignored -> 2), threads);
            awaitQueued(harness, 1);
            // when
            harness.db.close();
            // then
            assertThatThrownBy(() -> waiting.get(2, TimeUnit.SECONDS)).hasCauseInstanceOf(BusinessException.class)
                    .satisfies(failure -> assertThat(((BusinessException) failure.getCause()).getReason())
                            .isEqualTo(ViewportFailureReason.DB_SHUTTING_DOWN.name()));
            assertThat(running).isNotCompleted();
            release.countDown();
            assertThat(running.get(5, TimeUnit.SECONDS)).isEqualTo(1);
            assertThat(harness.registry.get("parking.viewport.db.pending").gauge().value()).isZero();
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("종료 후 요청은 SQL 실행 전에 거절하고 반복 종료는 안전하다")
    void rejects_after_close() throws Exception {
        // given
        try (Harness harness = new Harness()) {
            AtomicInteger queries = new AtomicInteger();
            harness.db.close();
            // when & then
            harness.db.close();
            assertThatThrownBy(() -> harness.db.read("source", deadline(), ignored -> queries.incrementAndGet()))
                    .isInstanceOfSatisfying(BusinessException.class, failure ->
                            assertThat(failure.getReason()).isEqualTo(ViewportFailureReason.DB_SHUTTING_DOWN.name()));
            assertThat(queries).hasValue(0);
        }
    }

    @Test
    @DisplayName("중단된 DB 용량 대기는 interrupt를 보존하고 실행 중인 요청의 슬롯을 반환하지 않는다")
    void interrupted_waiter_keeps_active_slot() throws Exception {
        // given
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        AtomicBoolean interrupted = new AtomicBoolean();
        try (Harness harness = new Harness(); var threads = Executors.newVirtualThreadPerTaskExecutor()) {
            var running = CompletableFuture.supplyAsync(() -> harness.db.read("source", deadline(), ignored -> {
                started.countDown();
                await(release);
                return 1;
            }), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            Thread waiter = Thread.ofVirtual().start(() -> {
                try {
                    harness.db.read("fallback", deadline(), ignored -> 2);
                } catch (Throwable rejected) {
                    failure.set(rejected);
                    interrupted.set(Thread.currentThread().isInterrupted());
                }
            });
            awaitQueued(harness, 1);
            // when
            waiter.interrupt();
            waiter.join(2000);
            // then
            assertThat(waiter.isAlive()).isFalse();
            assertThat(failure.get()).isInstanceOf(BusinessException.class);
            assertThat(interrupted).isTrue();
            assertThat(harness.registry.get("parking.viewport.db.active").gauge().value()).isEqualTo(1);
            assertThat(harness.registry.get("parking.viewport.db.queued").gauge().value()).isZero();
            release.countDown();
            assertThat(running.get(5, TimeUnit.SECONDS)).isEqualTo(1);
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("시작 전에 만료된 DB 요청은 연결을 얻거나 SQL을 실행하지 않는다")
    void rejects_expired_request_before_query() throws Exception {
        // given
        try (Harness harness = new Harness()) {
            AtomicInteger queries = new AtomicInteger();
            // when & then
            assertThatThrownBy(() -> harness.db.read("source", ViewportDeadline.after(Duration.ZERO),
                    ignored -> queries.incrementAndGet())).isInstanceOf(BusinessException.class);
            assertThat(queries).hasValue(0);
            verify(harness.pool, never()).getConnection();
        }
    }

    @ParameterizedTest(name = "cell={0}, row={1}")
    @CsvSource({"true, true", "true, false", "false, true", "false, false"})
    @DisplayName("셀과 원본 조회에서 늦게 반환한 행과 EOF를 거절하고 추가 fetch를 실행하지 않는다")
    void rejects_row_returned_after_total_deadline(boolean cellQuery, boolean present) throws Exception {
        // given
        try (Harness harness = new Harness()) {
            PreparedStatement statement = mock(PreparedStatement.class);
            ResultSet rows = mock(ResultSet.class);
            when(harness.pool.getConnection().prepareStatement(anyString())).thenReturn(statement);
            when(statement.executeQuery()).thenReturn(rows);
            ViewportBounds bounds = new ViewportBounds(126.99, 37.49, 127.01, 37.51);
            ParkingLotViewportRequest request = new ParkingLotViewportRequest(
                    bounds.west(), bounds.south(), bounds.east(), bounds.north(), false, false, false);
            ViewportCellKey key = new ViewportCellKey("deadline", 1, 1, 1000, 1);
            ViewportDeadline deadline = ViewportDeadline.after(Duration.ofSeconds(1));
            AtomicInteger fetches = new AtomicInteger();
            when(rows.next()).thenAnswer(invocation -> {
                fetches.incrementAndGet();
                while (deadline.remainingNanos() > 0) {
                    Thread.sleep(1);
                }
                return present;
            });
            Runnable query = cellQuery
                    ? () -> harness.db.load(List.of(key), deadline)
                    : () -> harness.db.fallback(bounds, request, 1, deadline, () -> { });

            // when & then
            assertThatThrownBy(query::run)
                    .isInstanceOfSatisfying(BusinessException.class, failure ->
                            assertThat(failure.getErrorCode()).isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE));
            assertThatThrownBy(query::run)
                    .isInstanceOfSatisfying(BusinessException.class, failure ->
                            assertThat(failure.getErrorCode()).isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE));
            assertThat(fetches).hasValue(1);
            verify(statement).executeQuery();
            verify(rows, never()).getLong(anyString());
            verify(rows, never()).getBoolean(anyString());
            assertThat(harness.registry.get("parking.viewport.db.active").gauge().value()).isZero();
        }
    }

    private static ViewportDeadline deadline() {
        return ViewportDeadline.after(Duration.ofSeconds(10));
    }

    private static void await(CountDownLatch latch) {
        try {
            assertThat(latch.await(5, TimeUnit.SECONDS)).isTrue();
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(failure);
        }
    }

    private static void awaitQueued(Harness harness, int expected) throws Exception {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (harness.registry.get("parking.viewport.db.queued").gauge().value() != expected) {
            assertThat(System.nanoTime()).isLessThan(until);
            Thread.sleep(1);
        }
    }

    private static final class Harness implements AutoCloseable {
        private final HikariDataSource pool = mock(HikariDataSource.class);
        private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
        private final JdbcTemplate primary = new JdbcTemplate(pool);
        private final ViewportRepository db;

        private Harness() throws Exception {
            Connection connection = mock(Connection.class);
            when(connection.getAutoCommit()).thenReturn(true);
            when(connection.createStatement()).thenReturn(mock(Statement.class));
            when(pool.getConnection()).thenReturn(connection);
            primary.setQueryTimeout(17);
            primary.setFetchSize(32);
            ViewportCacheProperties properties = new ViewportCacheProperties();
            properties.setMaxConcurrentDb(1);
            properties.setDbQueue(1);
            db = new ViewportRepository(primary, properties, new ViewportMetrics(registry),
                    new ParkingLodScoreCalculator(), new ViewportSquareGrid());
        }

        @Override
        public void close() {
            db.close();
            registry.close();
        }
    }
}
