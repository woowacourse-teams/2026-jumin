package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.viewport.ViewportUnavailableException.Reason;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;

class ViewportCellLoaderFailureReasonTest {

    @Test
    @DisplayName("셀 작업 한도를 넘긴 다른 키만 거절하고 기존 키의 follower는 결과를 공유한다")
    void reports_flight_limit_without_breaking_existing_followers() throws Exception {
        ViewportCacheProperties properties = properties();
        properties.setMaxInflightCells(1);
        ViewportMetrics metrics = metrics();
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        CompletableFuture<Map<ViewportCellKey, ViewportCell>> source = new CompletableFuture<>();
        CountDownLatch sourceStarted = new CountDownLatch(1);
        when(repository.load(anyList(), any(), any())).thenAnswer(invocation -> {
            sourceStarted.countDown();
            return source;
        });
        ViewportCellKey first = key(1);
        ViewportCell result = new ViewportCell(first, List.of());
        try (var executor = Executors.newVirtualThreadPerTaskExecutor();
             ViewportCellLoader loader = new ViewportCellLoader(new NoViewportCellStore(), repository, properties, metrics)) {
            var owner = CompletableFuture.supplyAsync(() -> resolve(loader, first, metrics), executor);
            assertThat(sourceStarted.await(5, TimeUnit.SECONDS)).isTrue();
            var follower = CompletableFuture.supplyAsync(() -> resolve(loader, first, metrics), executor);
            awaitFollower(metrics);

            assertReason(Reason.CELL_FLIGHT_LIMIT, () -> resolve(loader, key(2), metrics));
            source.complete(Map.of(first, result));
            assertThat(owner.get(5, TimeUnit.SECONDS)).singleElement()
                    .satisfies(loaded -> assertThat(loaded.cell()).isEqualTo(result));
            assertThat(follower.get(5, TimeUnit.SECONDS)).singleElement()
                    .satisfies(loaded -> assertThat(loaded.cell()).isEqualTo(result));
            verify(repository, times(1)).load(anyList(), any(), any());
        }
    }

    @Test
    @DisplayName("로더 작업자와 대기열이 모두 찼을 때 포화 원인을 보고하고 기존 작업은 완료한다")
    void reports_loader_queue_full_for_rejected_owner() throws Exception {
        ViewportCacheProperties properties = properties();
        ViewportMetrics metrics = metrics();
        BlockingStore store = new BlockingStore();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor();
             ViewportCellLoader loader = new ViewportCellLoader(store, mock(ViewportReadRepository.class), properties, metrics)) {
            try {
                var active = CompletableFuture.supplyAsync(() -> resolve(loader, key(1), metrics), executor);
                assertThat(store.entered.await(5, TimeUnit.SECONDS)).isTrue();
                var queued = CompletableFuture.supplyAsync(() -> resolve(loader, key(2), metrics), executor);
                awaitQueued(metrics);

                assertReason(Reason.CELL_LOADER_QUEUE_FULL, () -> resolve(loader, key(3), metrics));

                store.release.countDown();
                assertThat(active.get(5, TimeUnit.SECONDS)).hasSize(1);
                assertThat(queued.get(5, TimeUnit.SECONDS)).hasSize(1);
            } finally {
                store.release.countDown();
            }
        }
    }

    @Test
    @DisplayName("종료로 취소된 대기 작업과 종료 후 작업은 큐 포화가 아닌 종료 원인을 보고한다")
    void reports_closed_for_shutdown_cancellation_and_later_requests() throws Exception {
        ViewportCacheProperties properties = properties();
        ViewportMetrics metrics = metrics();
        BlockingStore store = new BlockingStore();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor();
             ViewportCellLoader loader = new ViewportCellLoader(store, mock(ViewportReadRepository.class), properties, metrics)) {
            try {
                CompletableFuture.supplyAsync(() -> resolve(loader, key(1), metrics), executor);
                assertThat(store.entered.await(5, TimeUnit.SECONDS)).isTrue();
                var queued = CompletableFuture.supplyAsync(() -> resolve(loader, key(2), metrics), executor);
                awaitQueued(metrics);

                loader.close();
                ExecutionException failure = assertThrows(ExecutionException.class,
                        () -> queued.get(5, TimeUnit.SECONDS));
                assertThat(failure.getCause()).isInstanceOf(ViewportUnavailableException.class);
                assertReason((ViewportUnavailableException) failure.getCause(), Reason.CELL_LOADER_CLOSED);
                assertReason(Reason.CELL_LOADER_CLOSED, () -> resolve(loader, key(3), metrics));
            } finally {
                store.release.countDown();
            }
        }
    }

    @Test
    @DisplayName("불완전한 source batch를 분류하고 소유권을 회수해 다음 요청을 정상 처리한다")
    void reports_incomplete_batch_and_releases_its_flight() {
        ViewportCacheProperties properties = properties();
        ViewportMetrics metrics = metrics();
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        ViewportCellKey key = key(1);
        ViewportCell complete = new ViewportCell(key, List.of());
        when(repository.load(anyList(), any(), any()))
                .thenReturn(CompletableFuture.completedFuture(Map.of()))
                .thenReturn(CompletableFuture.completedFuture(Map.of(key, complete)));
        try (ViewportCellLoader loader = new ViewportCellLoader(new NoViewportCellStore(), repository, properties, metrics)) {
            assertReason(Reason.CELL_INCOMPLETE_BATCH, () -> resolve(loader, key, metrics));
            assertThat(resolve(loader, key, metrics)).singleElement()
                    .satisfies(loaded -> assertThat(loaded.cell()).isEqualTo(complete));
            verify(repository, times(2)).load(anyList(), any(), any());
        }
    }

    private static ViewportCacheProperties properties() {
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setLoaderThreads(1);
        properties.setLoaderQueue(1);
        properties.setRequestTimeout(Duration.ofSeconds(10));
        return properties;
    }

    private static ViewportMetrics metrics() {
        return new ViewportMetrics(new SimpleMeterRegistry());
    }

    private static ViewportCellKey key(long id) {
        return new ViewportCellKey("test", 1, 1,
                new ViewportVersion(new UUID(0, 1), 1, 1000, true), id);
    }

    private static List<ViewportCellLoader.Result> resolve(ViewportCellLoader loader, ViewportCellKey key,
                                                            ViewportMetrics metrics) {
        return loader.resolve(List.of(key), Map.of(), ViewportDeadline.after(Duration.ofSeconds(10)),
                new ViewportObservation(metrics));
    }

    private static void assertReason(Reason expected, Executable action) {
        assertReason(assertThrows(ViewportUnavailableException.class, action), expected);
    }

    private static void assertReason(ViewportUnavailableException failure, Reason expected) {
        assertThat(failure.getReason()).isEqualTo(expected);
        assertThat(ViewportFailureDiagnostics.inspect(failure).reason()).isEqualTo(expected.name());
    }

    private static void awaitQueued(ViewportMetrics metrics) throws InterruptedException {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (metrics.registry().get("parking.viewport.loader.queued").gauge().value() != 1) {
            assertThat(System.nanoTime()).isLessThan(until);
            Thread.sleep(1);
        }
    }

    private static void awaitFollower(ViewportMetrics metrics) throws InterruptedException {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (metrics.registry().counter("parking.viewport.flights", "outcome", "follower_registered").count() < 1) {
            assertThat(System.nanoTime()).isLessThan(until);
            Thread.sleep(1);
        }
    }

    private static final class BlockingStore extends NoViewportCellStore {
        private final CountDownLatch entered = new CountDownLatch(1);
        private final CountDownLatch release = new CountDownLatch(1);

        @Override
        public Map<ViewportCellKey, ViewportCell> getMany(List<ViewportCellKey> keys, ViewportDeadline deadline) {
            entered.countDown();
            try {
                if (!release.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("recheck gate timed out");
                }
            } catch (InterruptedException failure) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("recheck gate interrupted", failure);
            }
            Map<ViewportCellKey, ViewportCell> result = new LinkedHashMap<>();
            keys.forEach(key -> result.put(key, new ViewportCell(key, List.of())));
            return result;
        }
    }
}
