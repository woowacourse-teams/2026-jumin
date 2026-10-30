package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import jumin.config.ViewportCacheProperties;
import jumin.global.exception.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ViewportCellLoaderFailureReasonTest {

    @Test
    @DisplayName("셀 한도 초과는 다른 키만 거절하고 같은 키의 대기 요청은 기존 결과를 공유한다")
    void preserves_registered_load_when_capacity_is_full() throws Exception {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxCells(1);
        properties.setMaxInflightCells(1);
        ViewportMetrics metrics = metrics();
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        when(repository.load(anyList(), any(), any())).thenAnswer(invocation -> {
            started.countDown();
            assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
            return Map.of(key(1), new ViewportCell(key(1), List.of()));
        });
        try (var threads = Executors.newVirtualThreadPerTaskExecutor();
             var loader = new ViewportCellLoader(new EmptyViewportCellStore(), repository, properties, metrics)) {
            // when
            var owner = CompletableFuture.supplyAsync(() -> resolve(loader, key(1), metrics), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            var follower = CompletableFuture.supplyAsync(() -> resolve(loader, key(1), metrics), threads);
            waitForFollower(metrics);
            // then
            assertThatThrownBy(() -> resolve(loader, key(2), metrics)).isInstanceOfSatisfying(BusinessException.class,
                    failure -> assertThat(failure.getReason()).isEqualTo(ViewportFailureReason.CELL_FLIGHT_LIMIT.name()));
            release.countDown();
            assertThat(owner.get(5, TimeUnit.SECONDS)).hasSize(1);
            assertThat(follower.get(5, TimeUnit.SECONDS)).hasSize(1);
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
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        when(repository.load(anyList(), any(), any())).thenAnswer(invocation -> {
            started.countDown();
            assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
            return Map.of(key(1), new ViewportCell(key(1), List.of()));
        });
        try (var threads = Executors.newVirtualThreadPerTaskExecutor();
             var loader = new ViewportCellLoader(new EmptyViewportCellStore(), repository, new ViewportCacheProperties(), metrics)) {
            var owner = CompletableFuture.supplyAsync(() -> resolve(loader, key(1), metrics), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            var follower = CompletableFuture.supplyAsync(() -> resolve(loader, key(1), metrics), threads);
            waitForFollower(metrics);
            // when
            loader.close();
            // then
            assertThatThrownBy(() -> follower.get(2, TimeUnit.SECONDS)).hasCauseInstanceOf(BusinessException.class)
                    .satisfies(failure -> assertThat(((BusinessException) failure.getCause()).getReason())
                            .isEqualTo(ViewportFailureReason.CELL_LOADER_CLOSED.name()));
            assertThatThrownBy(() -> resolve(loader, key(2), metrics)).isInstanceOfSatisfying(BusinessException.class,
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
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        ViewportCell cell = new ViewportCell(key(1), List.of());
        when(repository.load(anyList(), any(), any())).thenReturn(Map.of()).thenReturn(Map.of(key(1), cell));
        try (var loader = new ViewportCellLoader(new EmptyViewportCellStore(), repository, new ViewportCacheProperties(), metrics)) {
            // when & then
            assertThatThrownBy(() -> resolve(loader, key(1), metrics)).isInstanceOfSatisfying(BusinessException.class,
                    failure -> assertThat(failure.getReason()).isEqualTo(ViewportFailureReason.CELL_INCOMPLETE_BATCH.name()));
            assertThat(resolve(loader, key(1), metrics)).containsExactly(cell);
        }
    }

    @Test
    @DisplayName("대기 요청의 시간 초과는 대표 조회와 다른 대기 요청을 취소하지 않는다")
    void follower_timeout_does_not_cancel_owner() throws Exception {
        // given
        ViewportMetrics metrics = metrics();
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        when(repository.load(anyList(), any(), any())).thenAnswer(invocation -> {
            started.countDown();
            assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
            return Map.of(key(1), new ViewportCell(key(1), List.of()));
        });
        try (var threads = Executors.newVirtualThreadPerTaskExecutor();
             var loader = new ViewportCellLoader(new EmptyViewportCellStore(), repository, new ViewportCacheProperties(), metrics)) {
            var owner = CompletableFuture.supplyAsync(() -> resolve(loader, key(1), metrics), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            // when & then
            assertThatThrownBy(() -> loader.resolve(List.of(key(1)), Map.of(), ViewportDeadline.after(Duration.ofMillis(30)),
                    new ViewportObservation(metrics))).isInstanceOf(BusinessException.class);
            assertThat(owner).isNotCompleted();
            release.countDown();
            assertThat(owner.get(5, TimeUnit.SECONDS)).hasSize(1);
        } finally {
            release.countDown();
        }
    }

    private static List<ViewportCell> resolve(ViewportCellLoader loader, ViewportCellKey key, ViewportMetrics metrics) {
        return loader.resolve(List.of(key), Map.of(), ViewportDeadline.after(Duration.ofSeconds(10)), new ViewportObservation(metrics));
    }

    private static ViewportMetrics metrics() {
        return new ViewportMetrics(new SimpleMeterRegistry());
    }

    private static ViewportCellKey key(long id) {
        return new ViewportCellKey("reason", 1, 1, 1000, id);
    }

    private static void waitForFollower(ViewportMetrics metrics) throws Exception {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (metrics.registry().counter("parking.viewport.flights", "outcome", "follower_registered").count() == 0) {
            assertThat(System.nanoTime()).isLessThan(until);
            Thread.sleep(1);
        }
    }
}
