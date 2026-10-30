package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
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
import java.util.concurrent.atomic.AtomicReference;
import jumin.config.ViewportCacheProperties;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ViewportCellLoaderTest {

    @Test
    @DisplayName("owner의 요청 deadline이 끝나도 독립된 공유 작업은 follower에게 결과를 전달한다")
    void owner_timeout_does_not_expire_shared_job() throws Exception {
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        CompletableFuture<Map<ViewportCellKey, ViewportCell>> source = new CompletableFuture<>();
        CountDownLatch called = new CountDownLatch(1);
        when(repository.load(anyList(), any(), any())).thenAnswer(invocation -> {
            called.countDown();
            return source;
        });
        ViewportMetrics metrics = new ViewportMetrics(new SimpleMeterRegistry());
        ViewportCellKey key = key();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor();
             ViewportCellLoader loader = new ViewportCellLoader(new EmptyViewportCellStore(), repository,
                     new ViewportCacheProperties(), metrics)) {
            var owner = CompletableFuture.supplyAsync(() -> loader.resolve(List.of(key), Map.of(),
                    ViewportDeadline.after(Duration.ofMillis(40)), new ViewportObservation(metrics)), executor);
            assertThat(called.await(5, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> owner.get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(BusinessException.class)
                    .satisfies(failure -> assertThat(((BusinessException) failure.getCause()).getErrorCode())
                            .isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE));
            var follower = CompletableFuture.supplyAsync(() -> loader.resolve(List.of(key), Map.of(),
                    deadline(), new ViewportObservation(metrics)), executor);
            waitForFollower(metrics);

            source.complete(Map.of(key, new ViewportCell(key, List.of())));

            assertThat(follower.get(5, TimeUnit.SECONDS)).singleElement()
                    .satisfies(result -> assertThat(result.shared()).isTrue());
            verify(repository, times(1)).load(anyList(), any(), any());
        }
    }

    @Test
    @DisplayName("recheck Error도 owner와 follower를 종료하고 slot을 회수한다")
    void cleans_up_fatal_recheck() throws Exception {
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        ViewportCellKey key = key();
        when(repository.load(anyList(), any(), any()))
                .thenReturn(CompletableFuture.completedFuture(Map.of(key, new ViewportCell(key, List.of()))));
        CountDownLatch recheck = new CountDownLatch(1);
        CountDownLatch fail = new CountDownLatch(1);
        ViewportCellStore store = mock(ViewportCellStore.class);
        when(store.getMany(anyList(), any())).thenAnswer(invocation -> {
            recheck.countDown();
            await(fail);
            throw new AssertionError("injected recheck error");
        }).thenReturn(Map.of());
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxCells(1);
        properties.setMaxInflightCells(1);
        ViewportMetrics metrics = new ViewportMetrics(new SimpleMeterRegistry());
        try (var executor = Executors.newVirtualThreadPerTaskExecutor();
             ViewportCellLoader loader = new ViewportCellLoader(store, repository, properties, metrics)) {
            var owner = CompletableFuture.supplyAsync(() -> loader.resolve(List.of(key), Map.of(), deadline(),
                    new ViewportObservation(metrics)), executor);
            assertThat(recheck.await(5, TimeUnit.SECONDS)).isTrue();
            var follower = CompletableFuture.supplyAsync(() -> loader.resolve(List.of(key), Map.of(), deadline(),
                    new ViewportObservation(metrics)), executor);
            waitForFollower(metrics);

            fail.countDown();
            assertThatThrownBy(() -> owner.get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(BusinessException.class)
                    .satisfies(failure -> assertThat(((BusinessException) failure.getCause()).getErrorCode())
                            .isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE));
            assertThatThrownBy(() -> follower.get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(BusinessException.class)
                    .satisfies(failure -> assertThat(((BusinessException) failure.getCause()).getErrorCode())
                            .isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE));
            assertThat(loader.resolve(List.of(key), Map.of(), deadline(), new ViewportObservation(metrics))).hasSize(1);
        } finally {
            fail.countDown();
        }
    }

    private static void waitForFollower(ViewportMetrics metrics) throws Exception {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (metrics.registry().counter("parking.viewport.flights", "outcome", "follower_registered").count() < 1) {
            assertThat(System.nanoTime()).isLessThan(until);
            Thread.sleep(1);
        }
    }

    @Test
    @DisplayName("slot 하나로 같은 키의 동시 1000요청을 병합하고 cache 저장이 DB 완료 thread를 막지 않는다")
    void coalesces_one_thousand_requests() throws Exception {
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxCells(1);
        properties.setMaxInflightCells(1);
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        CompletableFuture<Map<ViewportCellKey, ViewportCell>> source = new CompletableFuture<>();
        CountDownLatch loading = new CountDownLatch(1);
        CountDownLatch releasePut = new CountDownLatch(1);
        CountDownLatch putStarted = new CountDownLatch(1);
        when(repository.load(anyList(), any(), any())).thenAnswer(invocation -> {
            loading.countDown();
            return source;
        });
        ViewportCellKey key = key();
        ViewportCell cell = new ViewportCell(key, List.of());
        ViewportCellStore store = new EmptyViewportCellStore() {
            @Override
            public void putMany(List<ViewportCell> cells, ViewportDeadline deadline) {
                putStarted.countDown();
                await(releasePut);
            }
        };
        ViewportMetrics metrics = new ViewportMetrics(new SimpleMeterRegistry());
        try (var executor = Executors.newVirtualThreadPerTaskExecutor();
             ViewportCellLoader loader = new ViewportCellLoader(store, repository, properties, metrics)) {
            List<CompletableFuture<List<ViewportCellLoadResult>>> requests = new ArrayList<>();
            for (int index = 0; index < 1000; index++) {
                requests.add(CompletableFuture.supplyAsync(() -> loader.resolve(List.of(key), Map.of(),
                        deadline(), new ViewportObservation(metrics)), executor));
            }
            assertThat(loading.await(5, TimeUnit.SECONDS)).isTrue();

            CompletableFuture<Void> completing = CompletableFuture.runAsync(() -> source.complete(Map.of(key, cell)), executor);
            try {
                for (var request : requests) {
                    assertThat(request.get(5, TimeUnit.SECONDS)).singleElement().satisfies(result -> {
                        assertThat(result.cell()).isEqualTo(cell);
                        assertThat(result.fromSource()).isTrue();
                    });
                }
                verify(repository, times(1)).load(anyList(), any(), any());
                assertThat(putStarted.await(5, TimeUnit.SECONDS)).isTrue();
                completing.get(1, TimeUnit.SECONDS);
                assertThat(releasePut.getCount()).isEqualTo(1);
            } finally {
                releasePut.countDown();
            }
            completing.get(5, TimeUnit.SECONDS);
        }
    }

    @Test
    @DisplayName("전체 공유 작업 deadline이 지난 source 결과는 follower에게 성공하거나 저장되지 않는다")
    void refuses_late_shared_job_result() throws Exception {
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        ViewportCellStore store = mock(ViewportCellStore.class);
        when(store.getMany(anyList(), any())).thenReturn(Map.of());
        CompletableFuture<Map<ViewportCellKey, ViewportCell>> source = new CompletableFuture<>();
        CountDownLatch started = new CountDownLatch(1);
        AtomicReference<ViewportDeadline> jobDeadline = new AtomicReference<>();
        when(repository.load(anyList(), any(), any())).thenAnswer(invocation -> {
            jobDeadline.set(invocation.getArgument(1));
            started.countDown();
            return source;
        });
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setRequestTimeout(Duration.ofMillis(100));
        ViewportMetrics metrics = new ViewportMetrics(new SimpleMeterRegistry());
        ViewportCellKey key = key();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor();
             ViewportCellLoader loader = new ViewportCellLoader(store, repository, properties, metrics)) {
            var request = CompletableFuture.supplyAsync(() -> loader.resolve(List.of(key), Map.of(), deadline(),
                    new ViewportObservation(metrics)), executor);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            while (jobDeadline.get().remainingNanos() > 0) {
                Thread.sleep(1);
            }

            source.complete(Map.of(key, new ViewportCell(key, List.of())));

            assertThatThrownBy(() -> request.get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(BusinessException.class)
                    .satisfies(failure -> assertThat(((BusinessException) failure.getCause()).getErrorCode())
                            .isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE));
            verify(store, times(0)).putMany(anyList(), any());
        }
    }

    @Test
    @DisplayName("실패한 batch는 보관하지 않고 소유권을 회수해 다음 요청이 다시 로드한다")
    void releases_failed_flight() {
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        ViewportCellKey key = key();
        ViewportCell cell = new ViewportCell(key, List.of());
        when(repository.load(anyList(), any(), any()))
                .thenReturn(CompletableFuture.failedFuture(ViewportFallbackException.mappingUnavailable()))
                .thenReturn(CompletableFuture.completedFuture(Map.of(key, cell)));
        ViewportMetrics metrics = new ViewportMetrics(new SimpleMeterRegistry());
        try (ViewportCellLoader loader = new ViewportCellLoader(new EmptyViewportCellStore(), repository,
                new ViewportCacheProperties(), metrics)) {
            assertThatThrownBy(() -> loader.resolve(List.of(key), Map.of(), deadline(), new ViewportObservation(metrics)))
                    .isInstanceOfSatisfying(ViewportFallbackException.class, failure ->
                            assertThat(failure.isCellTooLarge()).isFalse());
            assertThat(loader.resolve(List.of(key), Map.of(), deadline(), new ViewportObservation(metrics)))
                    .singleElement().satisfies(result -> assertThat(result.cell()).isEqualTo(cell));
            verify(repository, times(2)).load(anyList(), any(), any());
        }
    }

    private static ViewportCellKey key() {
        return new ViewportCellKey("test", 1, 1, 1000, 1);
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
}
