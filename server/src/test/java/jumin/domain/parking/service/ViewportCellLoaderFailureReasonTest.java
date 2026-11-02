package jumin.domain.parking.service;

import static jumin.config.ViewportCacheProperties.MAX_CELLS;
import static jumin.config.ViewportCacheProperties.MAX_INFLIGHT_CELLS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.stream.LongStream;
import jumin.domain.parking.cache.EmptyViewportCellStore;
import jumin.domain.parking.exception.ViewportFailureReason;
import jumin.domain.parking.model.ViewportCell;
import jumin.domain.parking.model.ViewportCellKey;
import jumin.domain.parking.model.ViewportDeadline;
import jumin.domain.parking.monitoring.ViewportMetrics;
import jumin.domain.parking.repository.ViewportRepository;
import jumin.global.exception.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ViewportCellLoaderFailureReasonTest {

    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();

    @Test
    @DisplayName("고정 셀 한도 초과는 새 키만 거절하고 같은 키의 대기 요청은 기존 결과를 공유한다")
    void preserves_registered_load_when_capacity_is_full() throws Exception {
        // given
        ViewportMetrics metrics = metrics();
        CountDownLatch started = new CountDownLatch(MAX_INFLIGHT_CELLS / MAX_CELLS);
        CountDownLatch release = new CountDownLatch(1);
        ViewportRepository repository = mock(ViewportRepository.class);
        when(repository.load(anyList(), any())).thenAnswer(invocation -> {
            List<ViewportCellKey> keys = invocation.getArgument(0);
            started.countDown();
            assertThat(release.await(10, TimeUnit.SECONDS)).isTrue();
            return keys.stream().collect(Collectors.toMap(key -> key, key -> new ViewportCell(key, List.of())));
        });
        try (var threads = Executors.newVirtualThreadPerTaskExecutor();
             var loader = new ViewportCellLoader(new EmptyViewportCellStore(), repository, metrics)) {
            List<CompletableFuture<List<ViewportCell>>> owners = new ArrayList<>();
            for (int offset = 0; offset < MAX_INFLIGHT_CELLS; offset += MAX_CELLS) {
                List<ViewportCellKey> keys = LongStream.rangeClosed(offset + 1L, offset + MAX_CELLS)
                        .mapToObj(ViewportCellLoaderFailureReasonTest::key).toList();
                owners.add(CompletableFuture.supplyAsync(() -> loader.resolve(keys, Map.of(),
                        ViewportDeadline.after(Duration.ofSeconds(30)), false), threads));
            }
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            // when
            var follower = CompletableFuture.supplyAsync(() -> resolve(loader, key(1)), threads);
            waitForFollower(registry);
            // then
            assertThatThrownBy(() -> resolve(loader, key(MAX_INFLIGHT_CELLS + 1L)))
                    .isInstanceOfSatisfying(BusinessException.class, failure ->
                            assertThat(failure.getReason()).isEqualTo(ViewportFailureReason.CELL_FLIGHT_LIMIT.name()));
            release.countDown();
            for (var owner : owners) {
                assertThat(owner.get(10, TimeUnit.SECONDS)).hasSize(MAX_CELLS);
            }
            assertThat(follower.get(5, TimeUnit.SECONDS)).hasSize(1);
            assertThat(registry.get("parking.viewport.loader.flights").gauge().value()).isZero();
            assertThat(resolve(loader, key(MAX_INFLIGHT_CELLS + 1L))).hasSize(1);
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("종료는 셀 잠금 대기와 이후 요청에 종료 원인을 전달한다")
    void shutdown_releases_waiters_with_closed_reason() throws Exception {
        // given
        ViewportMetrics metrics = metrics();
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ViewportRepository repository = mock(ViewportRepository.class);
        when(repository.load(anyList(), any())).thenAnswer(invocation -> {
            started.countDown();
            assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
            return Map.of(key(1), new ViewportCell(key(1), List.of()));
        });
        try (var threads = Executors.newVirtualThreadPerTaskExecutor();
             var loader = new ViewportCellLoader(new EmptyViewportCellStore(), repository, metrics)) {
            var owner = CompletableFuture.supplyAsync(() -> resolve(loader, key(1)), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            var follower = CompletableFuture.supplyAsync(() -> resolve(loader, key(1)), threads);
            waitForFollower(registry);
            // when
            loader.close();
            // then
            assertThatThrownBy(() -> follower.get(2, TimeUnit.SECONDS)).hasCauseInstanceOf(BusinessException.class)
                    .satisfies(failure -> assertThat(((BusinessException) failure.getCause()).getReason())
                            .isEqualTo(ViewportFailureReason.CELL_LOADER_CLOSED.name()));
            assertThatThrownBy(() -> resolve(loader, key(2))).isInstanceOfSatisfying(BusinessException.class,
                    failure -> assertThat(failure.getReason()).isEqualTo(ViewportFailureReason.CELL_LOADER_CLOSED.name()));
            release.countDown();
            assertThatThrownBy(() -> owner.get(5, TimeUnit.SECONDS)).hasCauseInstanceOf(BusinessException.class);
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("누락된 DB 셀 결과는 저장하지 않고 잠금을 반환해 다시 조회한다")
    void incomplete_batch_is_rejected_and_retryable() {
        // given
        ViewportMetrics metrics = metrics();
        ViewportRepository repository = mock(ViewportRepository.class);
        ViewportCell cell = new ViewportCell(key(1), List.of());
        when(repository.load(anyList(), any())).thenReturn(Map.of()).thenReturn(Map.of(key(1), cell));
        try (var loader = new ViewportCellLoader(new EmptyViewportCellStore(), repository, metrics)) {
            // when & then
            assertThatThrownBy(() -> resolve(loader, key(1))).isInstanceOfSatisfying(BusinessException.class,
                    failure -> assertThat(failure.getReason()).isEqualTo(ViewportFailureReason.CELL_INCOMPLETE_BATCH.name()));
            assertThat(resolve(loader, key(1))).containsExactly(cell);
        }
    }

    @Test
    @DisplayName("대기 요청의 시간 초과는 대표 조회와 다른 대기 요청을 취소하지 않는다")
    void follower_timeout_does_not_cancel_owner() throws Exception {
        // given
        ViewportMetrics metrics = metrics();
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ViewportRepository repository = mock(ViewportRepository.class);
        when(repository.load(anyList(), any())).thenAnswer(invocation -> {
            started.countDown();
            assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
            return Map.of(key(1), new ViewportCell(key(1), List.of()));
        });
        try (var threads = Executors.newVirtualThreadPerTaskExecutor();
             var loader = new ViewportCellLoader(new EmptyViewportCellStore(), repository, metrics)) {
            var owner = CompletableFuture.supplyAsync(() -> resolve(loader, key(1)), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            // when & then
            assertThatThrownBy(() -> loader.resolve(List.of(key(1)), Map.of(), ViewportDeadline.after(Duration.ofMillis(30)), false)).isInstanceOf(BusinessException.class);
            assertThat(owner).isNotCompleted();
            release.countDown();
            assertThat(owner.get(5, TimeUnit.SECONDS)).hasSize(1);
        } finally {
            release.countDown();
        }
    }

    private static List<ViewportCell> resolve(ViewportCellLoader loader, ViewportCellKey key) {
        return loader.resolve(List.of(key), Map.of(), ViewportDeadline.after(Duration.ofSeconds(10)), false);
    }

    private ViewportMetrics metrics() {
        return new ViewportMetrics(registry);
    }

    private static ViewportCellKey key(long id) {
        return new ViewportCellKey("reason", 1000, id);
    }

    private static void waitForFollower(SimpleMeterRegistry registry) throws Exception {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (registry.counter("parking.viewport.flights", "outcome", "follower_registered").count() == 0) {
            assertThat(System.nanoTime()).isLessThan(until);
            Thread.sleep(1);
        }
    }
}
