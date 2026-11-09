package jumin.domain.parking.repository;

import static jumin.config.ViewportCacheProperties.DB_QUEUE;
import static jumin.config.ViewportCacheProperties.MAX_VIEWPORT_ROWS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.zaxxer.hikari.HikariDataSource;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.IntStream;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.cache.ViewportCellStore;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
import jumin.domain.parking.exception.ViewportFailureReason;
import jumin.domain.parking.model.ViewportBounds;
import jumin.domain.parking.model.ViewportCellKey;
import jumin.domain.parking.model.ViewportDeadline;
import jumin.domain.parking.monitoring.ViewportMetrics;
import jumin.domain.parking.service.ParkingLodScoreCalculator;
import jumin.domain.parking.service.ViewportSquareGrid;
import jumin.domain.parking.service.ViewportCellCover;
import jumin.domain.parking.service.ViewportCellLoader;
import jumin.domain.parking.service.ViewportSearchService;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;

class ViewportRepositoryExecutionTest {

    @Test
    @DisplayName("동기 DB 조회는 실제 종료까지 대기하고 슬롯을 유지한다")
    void keeps_slot_until_actual_work_finishes() throws Exception {
        // given
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (Harness harness = new Harness(); var threads = Executors.newVirtualThreadPerTaskExecutor()) {
            harness.beforeQuery.set(() -> { started.countDown(); await(release); });
            ViewportDeadline deadline = spy(ViewportDeadline.after(Duration.ofSeconds(30)));
            var request = CompletableFuture.supplyAsync(() -> harness.load(deadline), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();

            // when
            doReturn(0L).when(deadline).remainingNanos();
            assertThatThrownBy(deadline::requireRemaining).isInstanceOf(BusinessException.class);
            var next = CompletableFuture.supplyAsync(() -> harness.load(deadline()), threads);

            // then
            assertThat(request).isNotCompleted();
            assertThat(harness.registry.get("parking.viewport.db.active").gauge().value()).isEqualTo(1);
            assertThat(next).isNotCompleted();
            release.countDown();
            assertThatThrownBy(() -> request.get(5, TimeUnit.SECONDS)).hasCauseInstanceOf(BusinessException.class);
            assertThat(next.get(5, TimeUnit.SECONDS)).isEqualTo(1);
            assertThat(harness.registry.get("parking.viewport.db.active").gauge().value()).isZero();
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("조회 실패 뒤 후속 요청은 영구 차단 없이 다시 실행된다")
    void failure_does_not_fence_subsequent_requests() throws Exception {
        // given
        try (Harness harness = new Harness()) {
            harness.beforeQuery.set(() -> { throw new IllegalStateException("query failed"); });

            // when & then
            assertThatThrownBy(() -> harness.load(deadline())).isInstanceOf(IllegalStateException.class);
            harness.beforeQuery.set(() -> { });
            assertThat(harness.load(deadline())).isEqualTo(1);
            assertThat(harness.registry.get("parking.viewport.db.active").gauge().value()).isZero();
        }
    }

    @Test
    @DisplayName("조회 실패와 기한 만료가 겹쳐도 원래 조회 실패를 기한 오류로 바꾸지 않는다")
    void preserves_query_failure_when_deadline_expires() throws Exception {
        // given
        try (Harness harness = new Harness()) {
            ViewportDeadline deadline = spy(ViewportDeadline.after(Duration.ofSeconds(30)));
            BusinessException queryFailure = ViewportFailureReason.UNCLASSIFIED.failure();
            harness.beforeQuery.set(() -> {
                doReturn(0L).when(deadline).remainingNanos();
                throw queryFailure;
            });

            // when & then
            assertThatThrownBy(() -> harness.load(deadline)).isSameAs(queryFailure);
            assertThat(harness.registry.get("parking.viewport.db.active").gauge().value()).isZero();
        }
    }

    @Test
    @DisplayName("중단된 DB 작업의 다른 비즈니스 오류는 viewport 기한 오류로 바꾸지 않는다")
    void preserves_other_business_errors_when_db_worker_is_interrupted() throws Exception {
        // given
        try (Harness harness = new Harness()) {
            BusinessException inputFailure = new BusinessException(ErrorCode.INVALID_INPUT);
            harness.beforeQuery.set(() -> {
                Thread.currentThread().interrupt();
                throw inputFailure;
            });

            // when & then
            try {
                assertThatThrownBy(() -> harness.load(deadline())).isSameAs(inputFailure);
            } finally {
                Thread.interrupted();
            }
        }
    }

    @Test
    @DisplayName("viewport 종료가 공유 DB 풀을 닫거나 공용 JdbcTemplate 설정을 변경하지 않는다")
    void preserves_shared_datasource_and_template_settings() throws Exception {
        // given
        Harness harness = new Harness();

        // when
        harness.db.close();

        // then
        verify(harness.pool, never()).close();
        assertThat(harness.primary.getQueryTimeout()).isEqualTo(17);
        assertThat(harness.primary.getFetchSize()).isEqualTo(32);
        harness.registry.close();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    @DisplayName("DB 실행과 대기 한도를 넘긴 요청만 거절하고 기존 요청은 완료한다")
    void bounds_active_and_waiting_requests(boolean cacheEnabled) throws Exception {
        // given
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (Harness harness = new Harness(); var threads = Executors.newVirtualThreadPerTaskExecutor()) {
            ViewportSearchService service = harness.service(cacheEnabled, Duration.ofSeconds(30));
            harness.beforeQuery.set(() -> { started.countDown(); await(release); });
            var running = CompletableFuture.supplyAsync(() -> harness.load(deadline()), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            List<CompletableFuture<Integer>> waiting = IntStream.range(0, DB_QUEUE)
                    .mapToObj(index -> CompletableFuture.supplyAsync(() -> service.search(request()).totalCount(), threads))
                    .toList();
            awaitQueued(harness, DB_QUEUE);

            // when & then
            assertThatThrownBy(() -> service.search(request()))
                    .isInstanceOfSatisfying(BusinessException.class, failure ->
                            assertThat(failure.getReason()).isEqualTo(ViewportFailureReason.DB_QUEUE_FULL.name()));
            assertThat(harness.registry.get("parking.viewport.db.active").gauge().value()).isEqualTo(1);
            release.countDown();
            assertThat(running.get(5, TimeUnit.SECONDS)).isEqualTo(1);
            for (var request : waiting) {
                assertThat(request.get(10, TimeUnit.SECONDS)).isZero();
            }
            assertThat(harness.registry.get("parking.viewport.db.queued").gauge().value()).isZero();
        } finally {
            release.countDown();
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    @DisplayName("DB 용량을 기다리다 만료된 요청은 SQL을 실행하지 않고 대기 용량을 반환한다")
    void expires_waiter_without_starting_query(boolean cacheEnabled) throws Exception {
        // given
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger queries = new AtomicInteger();
        try (Harness harness = new Harness(); var threads = Executors.newVirtualThreadPerTaskExecutor()) {
            ViewportSearchService service = harness.service(cacheEnabled, Duration.ofMillis(30));
            harness.beforeQuery.set(() -> { queries.incrementAndGet(); started.countDown(); await(release); });
            var running = CompletableFuture.supplyAsync(() -> harness.load(deadline()), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();

            // when & then
            assertThatThrownBy(() -> service.search(request()))
                    .isInstanceOfSatisfying(BusinessException.class, failure ->
                            assertThat(failure.getReason()).isEqualTo(ViewportFailureReason.DEADLINE.name()));
            assertThat(queries).hasValue(1);
            assertThat(harness.registry.get("parking.viewport.db.queued").gauge().value()).isZero();
            release.countDown();
            assertThat(running.get(5, TimeUnit.SECONDS)).isEqualTo(1);
            assertThat(harness.load(deadline())).isEqualTo(1);
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("신호를 받은 대기 요청이 만료되어도 다음 요청은 빈 DB 슬롯에서 실행된다")
    void expired_signalled_waiter_allows_next_request_to_run() throws Exception {
        // given
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger queries = new AtomicInteger();
        try (Harness harness = new Harness(); var threads = Executors.newVirtualThreadPerTaskExecutor()) {
            try {
                harness.beforeQuery.set(() -> { queries.incrementAndGet(); started.countDown(); await(release); });
                var running = CompletableFuture.supplyAsync(() -> harness.load(deadline()), threads);
                assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
                ViewportDeadline expiringDeadline = spy(ViewportDeadline.after(Duration.ofSeconds(30)));
                var expiring = CompletableFuture.supplyAsync(() -> harness.load(expiringDeadline), threads);
                awaitQueued(harness, 1);
                var next = CompletableFuture.supplyAsync(() -> harness.load(deadline()), threads);
                awaitQueued(harness, 2);

                // when
                // 실제 대기 타이머가 깨우기 전에 기한을 만료시켜 신호를 받은 요청이 슬롯 획득을 포기하게 한다.
                doReturn(0L).when(expiringDeadline).remainingNanos();
                release.countDown();

                // then
                assertThat(running.get(5, TimeUnit.SECONDS)).isEqualTo(1);
                assertThatThrownBy(() -> expiring.get(5, TimeUnit.SECONDS))
                        .hasCauseInstanceOf(BusinessException.class)
                        .satisfies(failure -> assertThat(((BusinessException) failure.getCause()).getReason())
                                .isEqualTo(ViewportFailureReason.DEADLINE.name()));
                assertThat(next.get(2, TimeUnit.SECONDS)).isEqualTo(1);
                assertThat(queries).hasValue(2);
                assertThat(harness.registry.get("parking.viewport.db.active").gauge().value()).isZero();
                assertThat(harness.registry.get("parking.viewport.db.queued").gauge().value()).isZero();
            } finally {
                // 검증 실패 시에도 실행 중인 조회와 대기 요청을 정리해 테스트 종료를 보장한다.
                release.countDown();
                harness.db.close();
            }
        }
    }

    @Test
    @DisplayName("종료는 대기 요청을 깨우고 실행 중인 동기 조회는 실제 종료까지 유지한다")
    void closes_waiters_without_finishing_running_query() throws Exception {
        // given
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (Harness harness = new Harness(); var threads = Executors.newVirtualThreadPerTaskExecutor()) {
            harness.beforeQuery.set(() -> { started.countDown(); await(release); });
            var running = CompletableFuture.supplyAsync(() -> harness.load(deadline()), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            var waiting = CompletableFuture.supplyAsync(() -> harness.findWithinBounds(deadline()), threads);
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
            harness.beforeQuery.set(queries::incrementAndGet);
            harness.db.close();

            // when & then
            harness.db.close();
            assertThatThrownBy(() -> harness.load(deadline()))
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
            harness.beforeQuery.set(() -> { started.countDown(); await(release); });
            var running = CompletableFuture.supplyAsync(() -> harness.load(deadline()), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            Thread waiter = Thread.ofVirtual().start(() -> {
                try {
                    harness.findWithinBounds(deadline());
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
            assertThat(failure.get()).isInstanceOfSatisfying(BusinessException.class, rejected ->
                    assertThat(rejected.getReason()).isEqualTo(ViewportFailureReason.DEADLINE.name()));
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
            // when & then
            assertThatThrownBy(() -> harness.load(ViewportDeadline.after(Duration.ZERO)))
                    .isInstanceOf(BusinessException.class);
            verify(harness.pool, never()).getConnection();
        }
    }

    @ParameterizedTest(name = "cell={0}, row={1}")
    @CsvSource({"true, true", "true, false", "false, true", "false, false"})
    @DisplayName("셀과 원본 조회에서 늦게 반환한 행과 EOF를 거절하고 추가 fetch를 실행하지 않는다")
    void rejects_row_returned_after_total_deadline(boolean cellQuery, boolean present) throws Exception {
        // given
        try (Harness harness = new Harness(Duration.ofSeconds(30))) {
            PreparedStatement statement = mock(PreparedStatement.class);
            PreparedStatement recoveryStatement = mock(PreparedStatement.class);
            ResultSet rows = mock(ResultSet.class);
            ResultSet recoveryRows = mock(ResultSet.class);
            when(harness.connection.prepareStatement(anyString())).thenReturn(statement, recoveryStatement);
            when(statement.executeQuery()).thenReturn(rows);
            when(recoveryStatement.executeQuery()).thenReturn(recoveryRows);
            when(recoveryRows.next()).thenReturn(true, false);
            when(recoveryRows.getBoolean("projection_ready")).thenReturn(true);
            when(recoveryRows.getInt("grid_size_meters")).thenReturn(1000);
            when(recoveryRows.getLong("id")).thenReturn(1L);
            when(recoveryRows.getDouble("latitude")).thenReturn(37.5);
            when(recoveryRows.getDouble("longitude")).thenReturn(127.0);
            ViewportBounds bounds = new ViewportBounds(126.99, 37.49, 127.01, 37.51);
            ParkingLotViewportRequest request = new ParkingLotViewportRequest(
                    bounds.west(), bounds.south(), bounds.east(), bounds.north(), false, false, false);
            ViewportCellKey key = new ViewportCellKey("deadline", 1000, 1);
            ViewportDeadline deadline = spy(ViewportDeadline.after(Duration.ofSeconds(30)));
            doReturn(TimeUnit.SECONDS.toNanos(30)).when(deadline).remainingNanos();
            AtomicInteger fetches = new AtomicInteger();
            when(rows.next()).thenAnswer(invocation -> {
                fetches.incrementAndGet();
                doReturn(0L).when(deadline).remainingNanos();
                return present;
            });
            Runnable query = () -> harness.db.findWithinBounds(bounds, request, 1, deadline);
            if (cellQuery) {
                query = () -> harness.db.load(List.of(key), deadline);
            }

            // when & then
            assertThatThrownBy(query::run)
                    .isInstanceOfSatisfying(BusinessException.class, failure -> {
                        assertThat(failure.getErrorCode()).isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE);
                        assertThat(failure.getReason()).isEqualTo(ViewportFailureReason.DEADLINE.name());
                    });
            assertThatThrownBy(query::run)
                    .isInstanceOfSatisfying(BusinessException.class, failure -> {
                        assertThat(failure.getErrorCode()).isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE);
                        assertThat(failure.getReason()).isEqualTo(ViewportFailureReason.DEADLINE.name());
                    });
            assertThat(fetches).hasValue(1);
            assertThat(deadline.remainingNanos()).isZero();
            verify(harness.pool).getConnection();
            verify(statement).executeQuery();
            verify(rows, never()).getLong(anyString());
            verify(rows, never()).getBoolean(anyString());
            verify(rows, never()).getInt(anyString());
            verify(rows, never()).getDouble(anyString());
            verify(rows, never()).getObject(anyString(), eq(Long.class));
            verify(rows, never()).getObject(anyString(), eq(Integer.class));
            verify(rows, never()).getObject(anyString(), eq(Boolean.class));
            verify(rows).close();
            verify(statement).close();
            verify(harness.connection).rollback();
            verify(harness.connection, never()).commit();
            verify(harness.connection).close();
            assertThat(harness.registry.get("parking.viewport.db.active").gauge().value()).isZero();
            assertThat(harness.registry.get("parking.viewport.db.queued").gauge().value()).isZero();

            int recovered;
            if (cellQuery) {
                recovered = harness.load(deadline());
            } else {
                recovered = harness.findWithinBounds(deadline());
            }
            assertThat(recovered).isEqualTo(1);
            verify(recoveryStatement).executeQuery();
            verify(recoveryRows).close();
            verify(recoveryStatement).close();
            verify(harness.connection).commit();
            verify(harness.connection, times(2)).close();
            assertThat(harness.registry.get("parking.viewport.db.active").gauge().value()).isZero();
            assertThat(harness.registry.get("parking.viewport.db.queued").gauge().value()).isZero();
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    @DisplayName("캐시 OFF와 fallback은 고정 전체 조회 행 상한까지 모두 반환하고 초과하면 부분 결과 없이 실패한다")
    void whole_viewport_preserves_fixed_row_limit_without_truncating(boolean cacheEnabled) throws Exception {
        // given
        AtomicInteger cursor = new AtomicInteger();
        AtomicInteger rowCount = new AtomicInteger(MAX_VIEWPORT_ROWS);
        ResultSet rows = (ResultSet) Proxy.newProxyInstance(ResultSet.class.getClassLoader(),
                new Class<?>[]{ResultSet.class}, (proxy, operation, arguments) -> switch (operation.getName()) {
                    case "next" -> cursor.incrementAndGet() <= rowCount.get();
                    case "getLong" -> (long) cursor.get();
                    case "getDouble" -> {
                        if ("latitude".equals(arguments[0])) {
                            yield 37.5;
                        }
                        yield 127.0;
                    }
                    case "getObject" -> switch ((String) arguments[0]) {
                        case "capacity" -> 50;
                        case "is_public" -> true;
                        default -> false;
                    };
                    case "wasNull", "isClosed" -> false;
                    default -> null;
                });
        try (Harness harness = new Harness(Duration.ofSeconds(30))) {
            ViewportSearchService service = harness.service(cacheEnabled, Duration.ofSeconds(30));
            PreparedStatement statement = mock(PreparedStatement.class);
            when(harness.pool.getConnection().prepareStatement(anyString())).thenReturn(statement);
            when(statement.executeQuery()).thenReturn(rows);
            ViewportBounds bounds = new ViewportBounds(126.5, 37, 127.5, 38);
            ParkingLotViewportRequest request = new ParkingLotViewportRequest(
                    bounds.west(), bounds.south(), bounds.east(), bounds.north(), false, false, false);
            // when & then
            ParkingLotViewportResponses response = service.search(request);
            assertThat(response.totalCount()).isEqualTo(MAX_VIEWPORT_ROWS);
            assertThat(response.parkingLots().getLast().id()).isEqualTo(MAX_VIEWPORT_ROWS);
            cursor.set(0);
            rowCount.set(MAX_VIEWPORT_ROWS + 1);
            assertThatThrownBy(() -> service.search(request))
                    .isInstanceOfSatisfying(BusinessException.class, failure ->
                            assertThat(failure.getErrorCode()).isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE));
            verify(statement, times(2)).setObject(anyInt(), eq(MAX_VIEWPORT_ROWS + 1));
            assertThat(harness.registry.get("parking.viewport.db.active").gauge().value()).isZero();
        }
    }

    private static ParkingLotViewportRequest request() {
        return new ParkingLotViewportRequest(126.99, 37.49, 127.01, 37.51, false, false, false);
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
        private final Connection connection = mock(Connection.class);
        private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
        private final JdbcTemplate primary = new JdbcTemplate(pool);
        private final ViewportRepository db;
        private final AtomicReference<Runnable> beforeQuery = new AtomicReference<>(() -> { });

        private Harness() throws Exception {
            this(Duration.ofSeconds(1));
        }

        private Harness(Duration dbTimeout) throws Exception {
            when(connection.getAutoCommit()).thenReturn(true);
            when(connection.createStatement()).thenReturn(mock(Statement.class));
            PreparedStatement statement = mock(PreparedStatement.class);
            AtomicBoolean cellQuery = new AtomicBoolean();
            when(connection.prepareStatement(anyString())).thenAnswer(invocation -> {
                cellQuery.set(((String) invocation.getArgument(0)).contains("WITH cells"));
                return statement;
            });
            when(statement.executeQuery()).thenAnswer(invocation -> {
                beforeQuery.get().run();
                ResultSet rows = mock(ResultSet.class);
                when(rows.next()).thenReturn(cellQuery.get(), false);
                when(rows.getBoolean("projection_ready")).thenReturn(true);
                when(rows.getInt("grid_size_meters")).thenReturn(1000);
                return rows;
            });
            when(pool.getConnection()).thenReturn(connection);
            primary.setQueryTimeout(17);
            primary.setFetchSize(32);
            ViewportCacheProperties properties = new ViewportCacheProperties();
            properties.setMaxConcurrentDb(1);
            properties.setDbTimeout(dbTimeout);
            db = new ViewportRepository(primary, properties, new ViewportMetrics(registry),
                    new ParkingLodScoreCalculator(), new ViewportSquareGrid());
        }

        private ViewportSearchService service(boolean cacheEnabled, Duration requestTimeout) {
            ViewportCacheProperties properties = new ViewportCacheProperties();
            properties.setEnabled(cacheEnabled);
            properties.setRequestTimeout(requestTimeout);
            ViewportCellCover cover = mock(ViewportCellCover.class);
            when(cover.cover(any())).thenReturn(List.of());
            return new ViewportSearchService(properties, cover, db, mock(ViewportCellStore.class),
                    mock(ViewportCellLoader.class), new ViewportMetrics(registry), new ParkingLodScoreCalculator(),
                    Clock.fixed(Instant.parse("2026-10-26T00:00:00Z"), ZoneOffset.UTC));
        }

        private int load(ViewportDeadline deadline) {
            return db.load(List.of(new ViewportCellKey("execution", 1000, 1)), deadline).size();
        }

        private int findWithinBounds(ViewportDeadline deadline) {
            ViewportBounds bounds = new ViewportBounds(126.99, 37.49, 127.01, 37.51);
            ParkingLotViewportRequest request = new ParkingLotViewportRequest(
                    bounds.west(), bounds.south(), bounds.east(), bounds.north(), false, false, false);
            ParkingLotViewportResponses response = db.findWithinBounds(bounds, request, 1, deadline);
            return response.totalCount();
        }

        @Override
        public void close() {
            db.close();
            registry.close();
        }
    }
}
