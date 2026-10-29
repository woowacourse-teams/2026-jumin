package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.domain.parking.dto.ParkingLotViewportResponse;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
import jumin.domain.parking.service.ParkingLodScoreCalculator;
import jumin.domain.parking.service.ParkingSearchService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ViewportStoreBypassTest {

    @Test
    @DisplayName("최초 cache 조회 장애가 발생한 100개 요청은 하나의 셀 source 작업을 공유한다")
    void coalesces_one_hundred_requests_after_initial_read_failure() throws Exception {
        exerciseConcurrentFailure(true);
    }

    @Test
    @DisplayName("owner cache 재조회 장애가 발생한 100개 요청은 하나의 셀 source 작업을 공유한다")
    void coalesces_one_hundred_requests_after_owner_recheck_failure() throws Exception {
        exerciseConcurrentFailure(false);
    }

    @Test
    @DisplayName("최초 조회 실패 후 다른 요청의 재조회 적중을 공유하면 source 없이 성공한다")
    void initial_failure_can_share_an_owner_recheck_hit() throws Exception {
        ViewportCacheProperties properties = properties();
        ViewportVersion version = version();
        ViewportCellKey key = key(version, 10);
        ViewportCell cell = new ViewportCell(key, List.of(item(1, 100)));
        CountDownLatch recheckStarted = new CountDownLatch(1);
        CountDownLatch releaseRecheck = new CountDownLatch(1);
        CountDownLatch followerRegistered = new CountDownLatch(1);
        CountDownLatch observed = new CountDownLatch(2);
        AtomicInteger initialReads = new AtomicInteger();
        ViewportMetrics metrics = new ViewportMetrics(new SimpleMeterRegistry()) {
            @Override
            public void count(String metric, String outcome, double amount) {
                super.count(metric, outcome, amount);
                if (metric.equals("flights") && outcome.equals("follower_registered")) {
                    followerRegistered.countDown();
                } else if (metric.equals("logical") && outcome.startsWith("follower_")) {
                    observed.countDown();
                }
            }
        };
        ViewportCellStore store = new NoViewportCellStore() {
            @Override
            public Map<ViewportCellKey, ViewportCell> getMany(List<ViewportCellKey> keys, ViewportDeadline deadline) {
                if (Thread.currentThread().getName().equals("viewport-cell-owner")) {
                    recheckStarted.countDown();
                    try {
                        if (!releaseRecheck.await(10, TimeUnit.SECONDS)) {
                            throw new IllegalStateException("recheck latch timed out");
                        }
                    } catch (InterruptedException failure) {
                        Thread.currentThread().interrupt();
                        throw new IllegalStateException(failure);
                    }
                    return Map.of(key, cell);
                }
                if (initialReads.incrementAndGet() == 1) {
                    return Map.of();
                }
                throw new ViewportStoreException("injected follower initial read failure");
            }
        };
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        when(repository.version(any())).thenReturn(version);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor();
             ViewportCellLoader loader = new ViewportCellLoader(store, repository, properties, metrics)) {
            try {
                ViewportSearchService service = service(properties, repository, store, loader, metrics, List.of(10L));
                var owner = CompletableFuture.supplyAsync(() -> search(service), executor);
                assertThat(recheckStarted.await(10, TimeUnit.SECONDS)).isTrue();
                var follower = CompletableFuture.supplyAsync(() -> search(service), executor);
                assertThat(followerRegistered.await(10, TimeUnit.SECONDS)).isTrue();

                releaseRecheck.countDown();

                ParkingLotViewportResponses expected = response(item(1, 100));
                assertThat(owner.get(10, TimeUnit.SECONDS)).isEqualTo(expected);
                assertThat(follower.get(10, TimeUnit.SECONDS)).isEqualTo(expected);
                assertThat(observed.await(10, TimeUnit.SECONDS)).isTrue();
                assertThat(initialReads).hasValue(2);
                verify(repository, times(0)).load(anyList(), any(), any());
                verify(repository, times(0)).fallback(any(), any(), anyInt(), any(), any());
                assertThat(counter(metrics, "store", "initial_get_failure")).isEqualTo(1);
                assertThat(counter(metrics, "store", "bypass_initial")).isEqualTo(1);
                assertThat(counter(metrics, "logical", "full_store_hit_true")).isZero();
                assertThat(counter(metrics, "logical", "full_store_hit_false")).isEqualTo(2);
                assertThat(counter(metrics, "logical", "source_independent_true")).isEqualTo(2);
                assertThat(counter(metrics, "logical", "source_independent_false")).isZero();
            } finally {
                releaseRecheck.countDown();
            }
        }
    }

    private void exerciseConcurrentFailure(boolean failInitial) throws Exception {
        int requestCount = 100;
        CountDownLatch followers = new CountDownLatch(requestCount - 1);
        CountDownLatch observed = new CountDownLatch(requestCount);
        CountDownLatch writeFailed = new CountDownLatch(1);
        ViewportMetrics metrics = new ViewportMetrics(new SimpleMeterRegistry()) {
            @Override
            public void count(String metric, String outcome, double amount) {
                super.count(metric, outcome, amount);
                if (metric.equals("flights") && outcome.equals("follower_registered")) {
                    followers.countDown();
                } else if (metric.equals("logical") && outcome.startsWith("follower_")) {
                    observed.countDown();
                } else if (metric.equals("store") && outcome.equals("put_failure")) {
                    writeFailed.countDown();
                }
            }
        };
        ViewportCacheProperties properties = properties();
        ViewportVersion version = version();
        ViewportCellKey key = key(version, 10);
        ViewportCell cell = new ViewportCell(key, List.of(item(1, 100)));
        AtomicInteger initialReads = new AtomicInteger();
        AtomicInteger rechecks = new AtomicInteger();
        ViewportCellStore store = new NoViewportCellStore() {
            @Override
            public Map<ViewportCellKey, ViewportCell> getMany(List<ViewportCellKey> keys, ViewportDeadline deadline) {
                if (Thread.currentThread().getName().equals("viewport-cell-owner")) {
                    rechecks.incrementAndGet();
                    throw new ViewportStoreException("injected owner recheck failure");
                }
                initialReads.incrementAndGet();
                if (failInitial) {
                    throw new ViewportStoreException("injected initial read failure",
                            new ViewportUnavailableException("cache local deadline exceeded"));
                }
                return Map.of();
            }

            @Override
            public void putMany(List<ViewportCell> cells, ViewportDeadline deadline) {
                throw new ViewportStoreException("injected shared write failure");
            }
        };
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        when(repository.version(any())).thenReturn(version);
        CompletableFuture<Map<ViewportCellKey, ViewportCell>> source = new CompletableFuture<>();
        CountDownLatch loading = new CountDownLatch(1);
        when(repository.load(anyList(), any(), any())).thenAnswer(invocation -> {
            ((Runnable) invocation.getArgument(2)).run();
            loading.countDown();
            return source;
        });
        try (var executor = Executors.newVirtualThreadPerTaskExecutor();
             ViewportCellLoader loader = new ViewportCellLoader(store, repository, properties, metrics)) {
            ViewportSearchService service = service(properties, repository, store, loader, metrics, List.of(10L));
            List<CompletableFuture<ParkingLotViewportResponses>> requests = new ArrayList<>();
            for (int index = 0; index < requestCount; index++) {
                requests.add(CompletableFuture.supplyAsync(() -> search(service), executor));
            }
            assertThat(loading.await(10, TimeUnit.SECONDS)).isTrue();
            assertThat(followers.await(10, TimeUnit.SECONDS)).isTrue();

            source.complete(Map.of(key, cell));

            ParkingLotViewportResponses expected = response(item(1, 100));
            for (CompletableFuture<ParkingLotViewportResponses> result : requests) {
                assertThat(result.get(10, TimeUnit.SECONDS)).isEqualTo(expected);
            }
            assertThat(writeFailed.await(10, TimeUnit.SECONDS)).isTrue();
            assertThat(observed.await(10, TimeUnit.SECONDS)).isTrue();
            assertThat(initialReads).hasValue(requestCount);
            assertThat(rechecks).hasValue(failInitial ? 0 : 1);
            verify(repository, times(1)).load(anyList(), any(), any());
            verify(repository, times(0)).fallback(any(), any(), anyInt(), any(), any());
            assertThat(counter(metrics, "store", "initial_get_failure")).isEqualTo(failInitial ? requestCount : 0);
            assertThat(counter(metrics, "store", "recheck_failure")).isEqualTo(failInitial ? 0 : 1);
            assertThat(counter(metrics, "store", "bypass_initial")).isEqualTo(failInitial ? requestCount : 0);
            assertThat(counter(metrics, "store", "bypass_recheck")).isEqualTo(failInitial ? 0 : 1);
            assertThat(counter(metrics, "store", "put_failure")).isEqualTo(1);
            assertThat(counter(metrics, "logical", "full_store_hit_true")).isZero();
            assertThat(counter(metrics, "logical", "full_store_hit_false")).isEqualTo(requestCount);
            assertThat(counter(metrics, "logical", "source_independent_true")).isZero();
            assertThat(counter(metrics, "logical", "source_independent_false")).isEqualTo(requestCount);
        } finally {
            source.completeExceptionally(new AssertionError("test finished before completing source"));
        }
    }

    @Test
    @DisplayName("singleflight를 끄면 장애 시에도 서로 다른 요청의 셀 source 작업을 합치지 않는다")
    void respects_disabled_singleflight_during_bypass() throws Exception {
        ViewportCacheProperties properties = properties();
        properties.setSingleflight(false);
        ViewportVersion version = version();
        ViewportCellKey key = key(version, 10);
        ViewportCell cell = new ViewportCell(key, List.of(item(1, 100)));
        ViewportMetrics metrics = new ViewportMetrics(new SimpleMeterRegistry());
        ViewportCellStore store = new NoViewportCellStore() {
            @Override
            public Map<ViewportCellKey, ViewportCell> getMany(List<ViewportCellKey> keys, ViewportDeadline deadline) {
                throw new ViewportStoreException("injected initial read failure");
            }
        };
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        when(repository.version(any())).thenReturn(version);
        CompletableFuture<Map<ViewportCellKey, ViewportCell>> source = new CompletableFuture<>();
        CountDownLatch started = new CountDownLatch(2);
        when(repository.load(anyList(), any(), any())).thenAnswer(invocation -> {
            started.countDown();
            return source;
        });
        try (var executor = Executors.newVirtualThreadPerTaskExecutor();
             ViewportCellLoader loader = new ViewportCellLoader(store, repository, properties, metrics)) {
            ViewportSearchService service = service(properties, repository, store, loader, metrics, List.of(10L));
            var first = CompletableFuture.supplyAsync(() -> search(service), executor);
            var second = CompletableFuture.supplyAsync(() -> search(service), executor);
            assertThat(started.await(10, TimeUnit.SECONDS)).isTrue();

            source.complete(Map.of(key, cell));

            assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo(response(item(1, 100)));
            assertThat(second.get(10, TimeUnit.SECONDS)).isEqualTo(response(item(1, 100)));
            verify(repository, times(2)).load(anyList(), any(), any());
            verify(repository, times(0)).fallback(any(), any(), anyInt(), any(), any());
        } finally {
            source.completeExceptionally(new AssertionError("test finished before completing source"));
        }
    }

    @Test
    @DisplayName("최초 조회와 재조회 각각의 cache 용량 초과는 셀 로딩이 아닌 전체 조회를 사용한다")
    void budget_failures_keep_fallback_for_initial_and_recheck() {
        for (boolean failInitial : List.of(true, false)) {
            ViewportCacheProperties properties = properties();
            ViewportVersion version = version();
            ViewportMetrics metrics = new ViewportMetrics(new SimpleMeterRegistry());
            ViewportCellStore store = new NoViewportCellStore() {
                @Override
                public Map<ViewportCellKey, ViewportCell> getMany(List<ViewportCellKey> keys, ViewportDeadline deadline) {
                    if (failInitial || Thread.currentThread().getName().equals("viewport-cell-owner")) {
                        throw new ViewportStoreBudgetException("injected capacity limit");
                    }
                    return Map.of();
                }
            };
            ViewportReadRepository repository = mock(ViewportReadRepository.class);
            when(repository.version(any())).thenReturn(version);
            ParkingLotViewportResponses expected = response(item(1, 100));
            when(repository.fallback(any(), any(), anyInt(), any(), any()))
                    .thenAnswer(invocation -> CompletableFuture.completedFuture(new ViewportBody(expected, () -> { })));
            try (ViewportCellLoader loader = new ViewportCellLoader(store, repository, properties, metrics)) {
                ViewportSearchService service = service(properties, repository, store, loader, metrics, List.of(10L));

                assertThat(search(service)).isEqualTo(expected);

                verify(repository, times(0)).load(anyList(), any(), any());
                verify(repository, times(1)).fallback(any(), any(), anyInt(), any(), any());
                assertThat(counter(metrics, "store", failInitial ? "initial_get_budget" : "recheck_budget")).isEqualTo(1);
                assertThat(counter(metrics, "store", "bypass_initial")).isZero();
                assertThat(counter(metrics, "store", "bypass_recheck")).isZero();
            }
        }
    }

    @Test
    @DisplayName("전체 요청 deadline이 소진된 조회는 cache 오류 뒤에 source 작업을 시작하지 않는다")
    void expired_request_deadline_does_not_start_source() {
        ViewportCacheProperties properties = properties();
        // A zero duration deterministically represents a deadline spent during version/cache lookup.
        properties.setRequestTimeout(Duration.ZERO);
        ViewportMetrics metrics = new ViewportMetrics(new SimpleMeterRegistry());
        ViewportCellStore store = new NoViewportCellStore() {
            @Override
            public Map<ViewportCellKey, ViewportCell> getMany(List<ViewportCellKey> keys, ViewportDeadline deadline) {
                throw new ViewportStoreException("injected initial read failure");
            }
        };
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        when(repository.version(any())).thenReturn(version());
        try (ViewportCellLoader loader = new ViewportCellLoader(store, repository, properties, metrics)) {
            ViewportSearchService service = service(properties, repository, store, loader, metrics, List.of(10L));

            assertThatThrownBy(() -> search(service)).isInstanceOf(ViewportUnavailableException.class);

            verify(repository, times(0)).load(anyList(), any(), any());
            verify(repository, times(0)).fallback(any(), any(), anyInt(), any(), any());
        }
    }

    @Test
    @DisplayName("셀 source 용량 초과와 조립 중 중복 항목 오류는 전체 조회로 정확한 결과를 반환한다")
    void source_oversize_and_assembly_integrity_failure_keep_fallback() {
        for (boolean oversize : List.of(true, false)) {
            ViewportCacheProperties properties = properties();
            ViewportVersion version = version();
            ViewportCellKey first = key(version, 10);
            ViewportCellKey second = key(version, 20);
            ViewportItem duplicate = item(1, 100);
            ViewportMetrics metrics = new ViewportMetrics(new SimpleMeterRegistry());
            ViewportCellStore store = new NoViewportCellStore() {
                @Override
                public Map<ViewportCellKey, ViewportCell> getMany(List<ViewportCellKey> keys, ViewportDeadline deadline) {
                    return oversize ? Map.of() : Map.of(first, new ViewportCell(first, List.of(duplicate)),
                            second, new ViewportCell(second, List.of(duplicate)));
                }
            };
            ViewportReadRepository repository = mock(ViewportReadRepository.class);
            when(repository.version(any())).thenReturn(version);
            when(repository.load(anyList(), any(), any()))
                    .thenReturn(CompletableFuture.failedFuture(new ViewportCellTooLargeException()));
            ParkingLotViewportResponses expected = response(duplicate);
            when(repository.fallback(any(), any(), anyInt(), any(), any()))
                    .thenAnswer(invocation -> CompletableFuture.completedFuture(new ViewportBody(expected, () -> { })));
            try (ViewportCellLoader loader = new ViewportCellLoader(store, repository, properties, metrics)) {
                ViewportSearchService service = service(properties, repository, store, loader, metrics, List.of(10L, 20L));

                assertThat(search(service)).isEqualTo(expected);

                verify(repository, times(oversize ? 1 : 0)).load(anyList(), any(), any());
                verify(repository, times(1)).fallback(any(), any(), anyInt(), any(), any());
                assertThat(counter(metrics, "requests", "oversize_bypass")).isEqualTo(oversize ? 1 : 0);
                assertThat(counter(metrics, "store", "assemble_failure")).isEqualTo(oversize ? 0 : 1);
                assertThat(counter(metrics, "store", "bypass_initial")).isZero();
                assertThat(counter(metrics, "store", "bypass_recheck")).isZero();
            }
        }
    }

    @Test
    @DisplayName("부분 cache 적중 후 재조회 장애가 나면 누락된 셀만 source에서 로드한다")
    void preserves_partial_hits_on_recheck_failure() {
        ViewportCacheProperties properties = properties();
        ViewportVersion version = version();
        ViewportCellKey first = key(version, 10);
        ViewportCellKey second = key(version, 20);
        ViewportItem hit = item(1, 100);
        ViewportItem missing = item(2, 200);
        ViewportMetrics metrics = new ViewportMetrics(new SimpleMeterRegistry());
        ViewportCellStore store = new NoViewportCellStore() {
            @Override
            public Map<ViewportCellKey, ViewportCell> getMany(List<ViewportCellKey> keys, ViewportDeadline deadline) {
                if (Thread.currentThread().getName().equals("viewport-cell-owner")) {
                    throw new ViewportStoreException("injected owner recheck failure");
                }
                return Map.of(first, new ViewportCell(first, List.of(hit)));
            }
        };
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        when(repository.version(any())).thenReturn(version);
        when(repository.load(anyList(), any(), any()))
                .thenReturn(CompletableFuture.completedFuture(Map.of(second, new ViewportCell(second, List.of(missing)))));
        try (ViewportCellLoader loader = new ViewportCellLoader(store, repository, properties, metrics)) {
            ViewportSearchService service = service(properties, repository, store, loader, metrics, List.of(10L, 20L));

            assertThat(search(service)).isEqualTo(response(hit, missing));

            verify(repository, times(1)).load(org.mockito.ArgumentMatchers.eq(List.of(second)), any(), any());
            verify(repository, times(0)).fallback(any(), any(), anyInt(), any(), any());
        }
    }

    @Test
    @DisplayName("cache 장애 중 source 버전 충돌이 나면 새 버전 셀을 다시 로드한다")
    void retries_version_change_during_bypass() {
        ViewportCacheProperties properties = properties();
        ViewportVersion before = version();
        ViewportVersion after = new ViewportVersion(before.epoch(), before.revision() + 1, 1000, true);
        ViewportCellKey newKey = key(after, 10);
        ViewportItem item = item(1, 100);
        ViewportMetrics metrics = new ViewportMetrics(new SimpleMeterRegistry());
        ViewportCellStore store = new NoViewportCellStore() {
            @Override
            public Map<ViewportCellKey, ViewportCell> getMany(List<ViewportCellKey> keys, ViewportDeadline deadline) {
                throw new ViewportStoreException("injected initial read failure");
            }
        };
        ViewportReadRepository repository = mock(ViewportReadRepository.class);
        when(repository.version(any())).thenReturn(before, after);
        when(repository.load(anyList(), any(), any())).thenAnswer(invocation -> {
            ((Runnable) invocation.getArgument(2)).run();
            List<ViewportCellKey> keys = invocation.getArgument(0);
            if (keys.getFirst().version().equals(before)) {
                return CompletableFuture.failedFuture(new ViewportVersionChangedException());
            }
            return CompletableFuture.completedFuture(Map.of(newKey, new ViewportCell(newKey, List.of(item))));
        });
        try (ViewportCellLoader loader = new ViewportCellLoader(store, repository, properties, metrics)) {
            ViewportSearchService service = service(properties, repository, store, loader, metrics, List.of(10L));

            assertThat(search(service)).isEqualTo(response(item));

            verify(repository, times(2)).version(any());
            verify(repository, times(1)).load(org.mockito.ArgumentMatchers.eq(List.of(key(before, 10))), any(), any());
            verify(repository, times(1)).load(org.mockito.ArgumentMatchers.eq(List.of(newKey)), any(), any());
            verify(repository, times(0)).fallback(any(), any(), anyInt(), any(), any());
            assertThat(counter(metrics, "requests", "version_retry")).isEqualTo(1);
            assertThat(counter(metrics, "store", "bypass_initial")).isEqualTo(2);
        }
    }

    @Test
    @DisplayName("조회 실패와 재시도는 최초 전체 적중이 아니며 source 미사용 성공은 독립 요청이다")
    void separates_first_lookup_hit_from_source_independence() {
        ViewportMetrics metrics = new ViewportMetrics(new SimpleMeterRegistry());
        ViewportObservation bypassed = new ViewportObservation(metrics);
        bypassed.eligible();
        bypassed.firstLookupFailed();
        bypassed.firstLookup(1, 1);
        bypassed.finish(true);
        ViewportObservation retried = new ViewportObservation(metrics);
        retried.eligible();
        retried.firstLookup(1, 0);
        retried.retry();
        retried.firstLookup(1, 1);
        retried.finish(true);
        ViewportObservation failedResponse = new ViewportObservation(metrics);
        failedResponse.eligible();
        failedResponse.firstLookup(1, 1);
        failedResponse.finish(false);

        assertThat(counter(metrics, "logical", "full_store_hit_true")).isZero();
        assertThat(counter(metrics, "logical", "full_store_hit_false")).isEqualTo(3);
        // A lookup failure or retry alone does not prove that this request consumed a source result.
        assertThat(counter(metrics, "logical", "source_independent_true")).isEqualTo(2);
        assertThat(counter(metrics, "logical", "source_independent_false")).isEqualTo(1);
    }

    private ViewportSearchService service(ViewportCacheProperties properties, ViewportReadRepository repository,
                                          ViewportCellStore store, ViewportCellLoader loader,
                                          ViewportMetrics metrics, List<Long> cells) {
        ViewportCellCover cover = mock(ViewportCellCover.class);
        when(cover.cover(any())).thenReturn(cells);
        return new ViewportSearchService(properties, mock(ParkingSearchService.class), cover, repository, store, loader,
                metrics, new ParkingLodScoreCalculator(), Clock.fixed(Instant.parse("2026-10-26T00:00:00Z"), ZoneOffset.UTC));
    }

    private ViewportCacheProperties properties() {
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setEnabled(true);
        properties.setEnvironment("bypass");
        properties.setMaxConcurrentRequests(0);
        properties.setRequestTimeout(Duration.ofSeconds(30));
        return properties;
    }

    private ParkingLotViewportResponses search(ViewportSearchService service) {
        try (ViewportBody body = service.search(new ParkingLotViewportRequest(
                126.99, 37.49, 127.01, 37.51, false, false))) {
            ParkingLotViewportResponses result = (ParkingLotViewportResponses) body.value();
            body.complete(true);
            return result;
        }
    }

    private ParkingLotViewportResponses response(ViewportItem... items) {
        ParkingLodScoreCalculator scores = new ParkingLodScoreCalculator();
        return ParkingLotViewportResponses.from(java.util.Arrays.stream(items)
                .map(item -> new ParkingLotViewportResponse(item.id(), item.latitude(), item.longitude(),
                        scores.calculate(item.capacity())))
                .toList());
    }

    private ViewportVersion version() {
        return new ViewportVersion(UUID.randomUUID(), 1, 1000, true);
    }

    private ViewportCellKey key(ViewportVersion version, long cell) {
        return new ViewportCellKey("bypass", 1, 1, version, cell);
    }

    private ViewportItem item(long id, int capacity) {
        return new ViewportItem(id, 37.5, 127, capacity, false, true, false, false, false);
    }

    private double counter(ViewportMetrics metrics, String metric, String outcome) {
        return metrics.registry().counter("parking.viewport." + metric, "outcome", outcome).count();
    }
}
