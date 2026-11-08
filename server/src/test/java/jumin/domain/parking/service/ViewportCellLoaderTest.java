package jumin.domain.parking.service;

import static jumin.config.ViewportCacheProperties.MAX_INFLIGHT_CELLS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
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
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;
import jumin.domain.parking.cache.EmptyViewportCellStore;
import jumin.domain.parking.cache.ViewportCellStore;
import jumin.domain.parking.exception.ViewportFallbackException;
import jumin.domain.parking.model.ViewportCell;
import jumin.domain.parking.model.ViewportCellKey;
import jumin.domain.parking.model.ViewportDeadline;
import jumin.domain.parking.monitoring.ViewportMetrics;
import jumin.domain.parking.repository.ViewportRepository;
import jumin.global.exception.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ViewportCellLoaderTest {

    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();

    @Test
    @DisplayName("초기 hit와 재조회 hit 및 DB 결과가 섞여도 요청 셀 순서를 유지한다")
    void preserves_requested_order_across_hit_recheck_and_database() {
        // given
        ViewportCell cached = new ViewportCell(key(3), List.of());
        ViewportCell rechecked = new ViewportCell(key(1), List.of());
        ViewportCell loaded = new ViewportCell(key(2), List.of());
        ViewportCellStore store = mock(ViewportCellStore.class);
        ViewportRepository repository = mock(ViewportRepository.class);
        when(store.getMany(anyList(), any())).thenReturn(Map.of(rechecked.key(), rechecked));
        when(repository.load(anyList(), any())).thenReturn(Map.of(loaded.key(), loaded));
        try (var loader = new ViewportCellLoader(store, repository, metrics())) {
            // when
            List<ViewportCell> result = loader.resolve(List.of(cached.key(), loaded.key(), rechecked.key()),
                    Map.of(cached.key(), cached), deadline(), false);

            // then
            assertThat(result).containsExactly(cached, loaded, rechecked);
            verify(repository).load(eq(List.of(loaded.key())), any());
        }
    }

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
        ViewportMetrics metrics = new ViewportMetrics(registry) {
            @Override
            public void count(String metric, String outcome, double amount) {
                super.count(metric, outcome, amount);
                if (metric.equals("flights") && outcome.equals("follower_registered")) {
                    followers.countDown();
                }
            }
        };
        ViewportRepository repository = mock(ViewportRepository.class);
        when(repository.load(anyList(), any())).thenAnswer(invocation -> {
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
        try (var threads = Executors.newVirtualThreadPerTaskExecutor();
             var loader = new ViewportCellLoader(store, repository, metrics)) {
            // when
            List<CompletableFuture<List<ViewportCell>>> requests = new ArrayList<>();
            for (int index = 0; index < 1000; index++) {
                requests.add(CompletableFuture.supplyAsync(() -> resolve(loader, key), threads));
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
            verify(repository, times(1)).load(anyList(), any());
            assertThat(registry.get("parking.viewport.loader.flights").gauge().value()).isZero();
        } finally {
            sourceRelease.countDown();
            writeRelease.countDown();
        }
    }

    @Test
    @DisplayName("다른 셀의 잠금을 기다리다 만료되어도 아직 조회하지 않은 셀의 대기 요청은 성공한다")
    void expired_lock_waiter_does_not_fail_unloaded_cell_followers() throws Exception {
        // given: A가 셀 2를 조회하는 동안 B는 셀 1을 잠근 채 셀 2를 기다리게 한다.
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicReference<Thread> waitingThread = new AtomicReference<>();
        ViewportDeadline expiringDeadline = spy(ViewportDeadline.after(Duration.ofSeconds(30)));
        ViewportRepository repository = mock(ViewportRepository.class);
        when(repository.load(anyList(), any())).thenAnswer(invocation -> {
            List<ViewportCellKey> keys = invocation.getArgument(0);
            if (keys.contains(key(2))) {
                started.countDown();
                await(release);
            }
            return keys.stream().collect(Collectors.toMap(key -> key, key -> new ViewportCell(key, List.of())));
        });
        try (var threads = Executors.newVirtualThreadPerTaskExecutor();
             var loader = new ViewportCellLoader(new EmptyViewportCellStore(), repository, metrics())) {
            try {
                var owner = CompletableFuture.supplyAsync(() -> resolve(loader, key(2)), threads);
                assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
                var expiring = CompletableFuture.supplyAsync(() -> {
                    waitingThread.set(Thread.currentThread());
                    return loader.resolve(List.of(key(1), key(2)), Map.of(), expiringDeadline, false);
                }, threads);
                waitForFollowers(registry, 1);
                // B가 셀 2의 잠금에서 실제로 대기한 뒤 C를 시작해 셀 1을 먼저 얻는 경합을 피한다.
                long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
                while (waitingThread.get().getState() != Thread.State.TIMED_WAITING) {
                    assertThat(System.nanoTime()).isLessThan(until);
                    Thread.sleep(1);
                }
                var follower = CompletableFuture.supplyAsync(() -> resolve(loader, key(1)), threads);
                waitForFollowers(registry, 2);

                // when: C가 셀 1에 등록된 뒤 B의 기한만 만료시킨다.
                doReturn(0L).when(expiringDeadline).remainingNanos();

                // then: B만 실패하고 C는 A의 셀 2 조회가 끝나기 전에 셀 1을 직접 조회한다.
                assertThatThrownBy(() -> expiring.get(5, TimeUnit.SECONDS)).hasCauseInstanceOf(BusinessException.class);
                assertThat(follower.get(2, TimeUnit.SECONDS)).containsExactly(new ViewportCell(key(1), List.of()));
                assertThat(owner).isNotCompleted();
                release.countDown();
                assertThat(owner.get(5, TimeUnit.SECONDS)).containsExactly(new ViewportCell(key(2), List.of()));
                verify(repository).load(eq(List.of(key(1))), any());
                verify(repository).load(eq(List.of(key(2))), any());
                verify(repository, times(2)).load(anyList(), any());
                assertThat(registry.get("parking.viewport.loader.flights").gauge().value()).isZero();
            } finally {
                release.countDown();
            }
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
        ViewportRepository repository = mock(ViewportRepository.class);
        when(repository.load(anyList(), any())).thenAnswer(invocation -> {
            if (calls.incrementAndGet() == 1) {
                ViewportDeadline deadline = invocation.getArgument(1);
                started.countDown();
                await(release);
                deadline.requireRemaining();
            }
            return Map.of(key, cell);
        });
        try (var threads = Executors.newVirtualThreadPerTaskExecutor();
             var loader = new ViewportCellLoader(new EmptyViewportCellStore(), repository, metrics)) {
            // when
            ViewportDeadline deadline = ViewportDeadline.after(Duration.ofMillis(100));
            var owner = CompletableFuture.supplyAsync(() -> loader.resolve(List.of(key), Map.of(), deadline, false), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            var follower = CompletableFuture.supplyAsync(() -> resolve(loader, key), threads);
            waitForFollowers(registry, 1);
            while (deadline.remainingNanos() > 0) {
                Thread.sleep(1);
            }
            // then
            assertThat(owner).isNotCompleted();
            release.countDown();
            assertThatThrownBy(() -> owner.get(5, TimeUnit.SECONDS)).hasCauseInstanceOf(BusinessException.class);
            assertThatThrownBy(() -> follower.get(5, TimeUnit.SECONDS)).hasCauseInstanceOf(BusinessException.class);
            assertThat(resolve(loader, key)).containsExactly(cell);
            verify(repository, times(2)).load(anyList(), any());
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("겹치는 셀을 역순으로 요청해도 교착 없이 결과를 합치고 중복 셀은 재조회하지 않는다")
    void orders_overlapping_cell_locks() throws Exception {
        // given
        ViewportMetrics metrics = metrics();
        ViewportRepository repository = mock(ViewportRepository.class);
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(repository.load(anyList(), any())).thenAnswer(invocation -> {
            List<ViewportCellKey> keys = invocation.getArgument(0);
            started.countDown();
            await(release);
            return keys.stream().collect(Collectors.toMap(key -> key, key -> new ViewportCell(key, List.of())));
        });
        try (var threads = Executors.newVirtualThreadPerTaskExecutor();
             var loader = new ViewportCellLoader(new EmptyViewportCellStore(), repository, metrics)) {
            // when
            var first = CompletableFuture.supplyAsync(() -> loader.resolve(List.of(key(2), key(1)), Map.of(),
                    deadline(), false), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            var second = CompletableFuture.supplyAsync(() -> loader.resolve(List.of(key(1), key(2)), Map.of(),
                    deadline(), false), threads);
            waitForFollowers(registry, 2);
            release.countDown();
            // then
            assertThat(first.get(5, TimeUnit.SECONDS)).extracting(ViewportCell::key).containsExactly(key(2), key(1));
            assertThat(second.get(5, TimeUnit.SECONDS)).extracting(ViewportCell::key).containsExactly(key(1), key(2));
            verify(repository, times(1)).load(anyList(), any());
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("DB 실패 뒤에는 셀 잠금과 슬롯을 반환한다")
    void releases_locks_after_failures() {
        // given
        ViewportMetrics metrics = metrics();
        ViewportRepository repository = mock(ViewportRepository.class);
        ViewportCellKey key = key(1);
        ViewportCell cell = new ViewportCell(key, List.of());
        ViewportCellStore store = new EmptyViewportCellStore();
        AtomicInteger calls = new AtomicInteger();
        when(repository.load(anyList(), any())).thenAnswer(invocation -> {
            if (calls.incrementAndGet() % 2 == 1) {
                throw ViewportFallbackException.mappingUnavailable();
            }
            return Map.of(key, cell);
        });
        try (var loader = new ViewportCellLoader(store, repository, metrics)) {
            // when & then
            for (int attempt = 0; attempt <= MAX_INFLIGHT_CELLS; attempt++) {
                assertThatThrownBy(() -> resolve(loader, key)).isInstanceOf(ViewportFallbackException.class);
                assertThat(resolve(loader, key)).containsExactly(cell);
            }
            assertThat(registry.get("parking.viewport.loader.flights").gauge().value()).isZero();
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
        ViewportRepository repository = mock(ViewportRepository.class);
        when(repository.load(anyList(), any())).thenReturn(Map.of(key, cell));
        ViewportCellStore store = mock(ViewportCellStore.class);
        when(store.getMany(anyList(), any())).thenAnswer(invocation -> {
            entered.countDown();
            await(release);
            throw new AssertionError("recheck failed");
        }).thenReturn(Map.of());
        try (var threads = Executors.newVirtualThreadPerTaskExecutor();
             var loader = new ViewportCellLoader(store, repository, metrics)) {
            // when
            var owner = CompletableFuture.supplyAsync(() -> resolve(loader, key), threads);
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            var follower = CompletableFuture.supplyAsync(() -> resolve(loader, key), threads);
            waitForFollowers(registry, 1);
            release.countDown();
            // then
            assertThatThrownBy(() -> owner.get(5, TimeUnit.SECONDS)).hasCauseInstanceOf(BusinessException.class);
            assertThatThrownBy(() -> follower.get(5, TimeUnit.SECONDS)).hasCauseInstanceOf(BusinessException.class);
            assertThat(resolve(loader, key)).containsExactly(cell);
            assertThat(registry.get("parking.viewport.loader.flights").gauge().value()).isZero();
        } finally {
            release.countDown();
        }
    }

    private static List<ViewportCell> resolve(ViewportCellLoader loader, ViewportCellKey key) {
        return loader.resolve(List.of(key), Map.of(), deadline(), false);
    }

    private ViewportMetrics metrics() {
        return new ViewportMetrics(registry);
    }

    private static ViewportCellKey key(long id) {
        return new ViewportCellKey("test", 1000, id);
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

    private static void waitForFollowers(SimpleMeterRegistry registry, int expected) throws Exception {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (registry.counter("parking.viewport.flights", "outcome", "follower_registered").count() < expected) {
            assertThat(System.nanoTime()).isLessThan(until);
            Thread.sleep(1);
        }
    }
}
