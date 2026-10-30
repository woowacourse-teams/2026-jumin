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
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import jumin.config.ViewportCacheProperties;
import jumin.global.exception.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ViewportCellLoaderTest {

    @Test
    @DisplayName("같은 셀의 1000개 요청은 DB 조회와 동기 캐시 저장 한 번을 함께 기다린다")
    void coalesces_one_thousand_requests_and_waits_for_cache_write() throws Exception {
        // given
        ViewportCellKey key = key(1);
        ViewportCell cell = new ViewportCell(key, List.of());
        CountDownLatch loading = new CountDownLatch(1);
        CountDownLatch sourceRelease = new CountDownLatch(1);
        CountDownLatch followers = new CountDownLatch(999);
        CountDownLatch writing = new CountDownLatch(1);
        CountDownLatch writeRelease = new CountDownLatch(1);
        ViewportMetrics metrics = new ViewportMetrics(new SimpleMeterRegistry()) {
            @Override
            public void count(String metric, String outcome, double amount) {
                super.count(metric, outcome, amount);
                if (metric.equals("flights") && outcome.equals("follower_registered")) {
                    followers.countDown();
                }
            }
        };
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        when(repository.load(anyList(), any(), any())).thenAnswer(invocation -> {
            loading.countDown();
            await(sourceRelease);
            return Map.of(key, cell);
        });
        ViewportCellStore store = new EmptyViewportCellStore() {
            @Override
            public void putMany(List<ViewportCell> cells, ViewportDeadline deadline) {
                writing.countDown();
                await(writeRelease);
            }
        };
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxCells(1);
        properties.setMaxInflightCells(1);
        try (var threads = Executors.newVirtualThreadPerTaskExecutor();
             var loader = new ViewportCellLoader(store, repository, properties, metrics)) {
            // when
            List<CompletableFuture<List<ViewportCell>>> requests = new ArrayList<>();
            for (int index = 0; index < 1000; index++) {
                requests.add(CompletableFuture.supplyAsync(() -> resolve(loader, key, metrics), threads));
            }
            assertThat(loading.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(followers.await(5, TimeUnit.SECONDS)).isTrue();
            sourceRelease.countDown();
            assertThat(writing.await(5, TimeUnit.SECONDS)).isTrue();
            // then
            assertThat(requests).allSatisfy(request -> assertThat(request).isNotCompleted());
            writeRelease.countDown();
            for (var request : requests) {
                assertThat(request.get(5, TimeUnit.SECONDS)).containsExactly(cell);
            }
            verify(repository, times(1)).load(anyList(), any(), any());
            assertThat(metrics.registry().get("parking.viewport.loader.flights").gauge().value()).isZero();
        } finally {
            sourceRelease.countDown();
            writeRelease.countDown();
        }
    }

    @Test
    @DisplayName("대표 조회의 만료 실패는 공유 요청에 전달하고 다음 요청은 다시 조회한다")
    void propagates_owner_deadline_and_allows_retry() throws Exception {
        // given
        ViewportCellKey key = key(1);
        ViewportCell cell = new ViewportCell(key, List.of());
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ViewportMetrics metrics = metrics();
        AtomicInteger calls = new AtomicInteger();
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        when(repository.load(anyList(), any(), any())).thenAnswer(invocation -> {
            if (calls.incrementAndGet() == 1) {
                ViewportDeadline deadline = invocation.getArgument(1);
                started.countDown();
                await(release);
                deadline.requireRemaining();
            }
            return Map.of(key, cell);
        });
        try (var threads = Executors.newVirtualThreadPerTaskExecutor();
             var loader = new ViewportCellLoader(new EmptyViewportCellStore(), repository, new ViewportCacheProperties(), metrics)) {
            // when
            ViewportDeadline deadline = ViewportDeadline.after(Duration.ofMillis(100));
            var owner = CompletableFuture.supplyAsync(() -> loader.resolve(List.of(key), Map.of(), deadline,
                    new ViewportObservation(metrics)), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            var follower = CompletableFuture.supplyAsync(() -> resolve(loader, key, metrics), threads);
            waitForFollowers(metrics, 1);
            while (deadline.remainingNanos() > 0) {
                Thread.sleep(1);
            }
            // then
            assertThat(owner).isNotCompleted();
            release.countDown();
            assertThatThrownBy(() -> owner.get(5, TimeUnit.SECONDS)).hasCauseInstanceOf(BusinessException.class);
            assertThatThrownBy(() -> follower.get(5, TimeUnit.SECONDS)).hasCauseInstanceOf(BusinessException.class);
            assertThat(resolve(loader, key, metrics)).containsExactly(cell);
            verify(repository, times(2)).load(anyList(), any(), any());
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("겹치는 셀을 역순으로 요청해도 교착 없이 결과를 합치고 중복 셀은 재조회하지 않는다")
    void orders_overlapping_cell_locks() throws Exception {
        // given
        ViewportMetrics metrics = metrics();
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(repository.load(anyList(), any(), any())).thenAnswer(invocation -> {
            List<ViewportCellKey> keys = invocation.getArgument(0);
            started.countDown();
            await(release);
            return keys.stream().collect(Collectors.toMap(key -> key, key -> new ViewportCell(key, List.of())));
        });
        try (var threads = Executors.newVirtualThreadPerTaskExecutor();
             var loader = new ViewportCellLoader(new EmptyViewportCellStore(), repository, new ViewportCacheProperties(), metrics)) {
            // when
            var first = CompletableFuture.supplyAsync(() -> loader.resolve(List.of(key(2), key(1)), Map.of(),
                    deadline(), new ViewportObservation(metrics)), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            var second = CompletableFuture.supplyAsync(() -> loader.resolve(List.of(key(1), key(2)), Map.of(),
                    deadline(), new ViewportObservation(metrics)), threads);
            waitForFollowers(metrics, 2);
            release.countDown();
            // then
            assertThat(first.get(5, TimeUnit.SECONDS)).extracting(ViewportCell::key).containsExactly(key(2), key(1));
            assertThat(second.get(5, TimeUnit.SECONDS)).extracting(ViewportCell::key).containsExactly(key(1), key(2));
            verify(repository, times(1)).load(anyList(), any(), any());
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("DB 실패 뒤에는 셀 잠금과 슬롯을 반환한다")
    void releases_locks_after_failures() {
        // given
        ViewportMetrics metrics = metrics();
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        ViewportCellKey key = key(1);
        ViewportCell cell = new ViewportCell(key, List.of());
        ViewportCellStore store = new EmptyViewportCellStore();
        when(repository.load(anyList(), any(), any())).thenThrow(ViewportFallbackException.mappingUnavailable())
                .thenReturn(Map.of(key, cell));
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxCells(1);
        properties.setMaxInflightCells(1);
        try (var loader = new ViewportCellLoader(store, repository, properties, metrics)) {
            // when & then
            assertThatThrownBy(() -> resolve(loader, key, metrics)).isInstanceOf(ViewportFallbackException.class);
            assertThat(resolve(loader, key, metrics)).containsExactly(cell);
            assertThat(metrics.registry().get("parking.viewport.loader.flights").gauge().value()).isZero();
        }
    }

    @Test
    @DisplayName("재조회 Error는 대표 요청과 대기 요청에 함께 전달하고 셀 슬롯을 회수한다")
    void propagates_recheck_error_to_waiters_and_releases_capacity() throws Exception {
        // given
        ViewportMetrics metrics = metrics();
        ViewportCellKey key = key(1);
        ViewportCell cell = new ViewportCell(key, List.of());
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        when(repository.load(anyList(), any(), any())).thenReturn(Map.of(key, cell));
        ViewportCellStore store = mock(ViewportCellStore.class);
        when(store.getMany(anyList(), any())).thenAnswer(invocation -> {
            entered.countDown();
            await(release);
            throw new AssertionError("recheck failed");
        }).thenReturn(Map.of());
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxCells(1);
        properties.setMaxInflightCells(1);
        try (var threads = Executors.newVirtualThreadPerTaskExecutor();
             var loader = new ViewportCellLoader(store, repository, properties, metrics)) {
            // when
            var owner = CompletableFuture.supplyAsync(() -> resolve(loader, key, metrics), threads);
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            var follower = CompletableFuture.supplyAsync(() -> resolve(loader, key, metrics), threads);
            waitForFollowers(metrics, 1);
            release.countDown();
            // then
            assertThatThrownBy(() -> owner.get(5, TimeUnit.SECONDS)).hasCauseInstanceOf(BusinessException.class);
            assertThatThrownBy(() -> follower.get(5, TimeUnit.SECONDS)).hasCauseInstanceOf(BusinessException.class);
            assertThat(resolve(loader, key, metrics)).containsExactly(cell);
            assertThat(metrics.registry().get("parking.viewport.loader.flights").gauge().value()).isZero();
        } finally {
            release.countDown();
        }
    }

    private static List<ViewportCell> resolve(ViewportCellLoader loader, ViewportCellKey key, ViewportMetrics metrics) {
        return loader.resolve(List.of(key), Map.of(), deadline(), new ViewportObservation(metrics));
    }

    private static ViewportMetrics metrics() {
        return new ViewportMetrics(new SimpleMeterRegistry());
    }

    private static ViewportCellKey key(long id) {
        return new ViewportCellKey("test", 1, 1, 1000, id);
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

    private static void waitForFollowers(ViewportMetrics metrics, int expected) throws Exception {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (metrics.registry().counter("parking.viewport.flights", "outcome", "follower_registered").count() < expected) {
            assertThat(System.nanoTime()).isLessThan(until);
            Thread.sleep(1);
        }
    }
}
