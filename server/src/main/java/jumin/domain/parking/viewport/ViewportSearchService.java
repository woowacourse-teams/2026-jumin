package jumin.domain.parking.viewport;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.domain.parking.dto.ParkingLotViewportResponse;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
import jumin.domain.parking.service.ParkingLodScoreCalculator;
import jumin.domain.parking.service.ParkingSearchService;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.TransactionException;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(propagation = Propagation.NEVER)
public class ViewportSearchService {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private final ViewportCacheProperties properties;
    private final ParkingSearchService legacy;
    private final ViewportCellCover cover;
    private final ViewportReadRepository repository;
    private final ViewportCellStore store;
    private final ViewportCellLoader loader;
    private final ViewportMetrics metrics;
    private final ParkingLodScoreCalculator scores;
    private final Clock clock;
    private final Semaphore requests;
    private final int maximumRequests;
    private final AtomicInteger activeRequests = new AtomicInteger();

    public ViewportSearchService(ViewportCacheProperties properties, ParkingSearchService legacy,
                                  ViewportCellCover cover, ViewportReadRepository repository,
                                  ViewportCellStore store, ViewportCellLoader loader, ViewportMetrics metrics,
                                  ParkingLodScoreCalculator scores, Clock clock) {
        this.properties = properties;
        this.legacy = legacy;
        this.cover = cover;
        this.repository = repository;
        this.store = store;
        this.loader = loader;
        this.metrics = metrics;
        this.scores = scores;
        this.clock = clock;
        maximumRequests = properties.getMaxConcurrentRequests();
        requests = maximumRequests == 0 ? null : new Semaphore(maximumRequests);
        metrics.registry().gauge("parking.viewport.requests.active", activeRequests);
        metrics.registry().gauge("parking.viewport.requests.limit", this, service -> service.maximumRequests);
    }

    public ViewportBody search(ParkingLotViewportRequest request) {
        ViewportBounds bounds;
        try {
            bounds = ViewportBounds.from(request);
        } catch (IllegalArgumentException failure) {
            throw new BusinessException(ErrorCode.INVALID_INPUT);
        }
        if (!properties.isEnabled()) {
            return new ViewportBody(legacy.searchViewport(request), () -> { });
        }
        ViewportObservation observation = new ViewportObservation(metrics);
        if (requests != null && !requests.tryAcquire()) {
            metrics.count("requests", "admission_rejected", 1);
            throw new ViewportUnavailableException("viewport 응답 처리 한도를 초과했습니다.");
        }
        activeRequests.incrementAndGet();
        try {
            ViewportDeadline deadline = ViewportDeadline.after(properties.getRequestTimeout());
            DayOfWeek day = LocalDate.ofInstant(clock.instant(), SEOUL).getDayOfWeek();
            ViewportBody body = execute(bounds, request, day, deadline, observation);
            if (deadline.remainingNanos() == 0) {
                body.close();
                deadline.requireRemaining();
            }
            return body.onCompletion(success -> {
                try {
                    observation.finish(success);
                } finally {
                    releaseRequest();
                }
            });
        } catch (RuntimeException | Error failure) {
            try {
                observation.finish(false);
            } finally {
                releaseRequest();
            }
            if (failure instanceof DataAccessException || failure instanceof TransactionException) {
                throw new ViewportUnavailableException("viewport 원본 조회를 완료할 수 없습니다.", failure);
            }
            throw failure;
        }
    }

    private void releaseRequest() {
        activeRequests.decrementAndGet();
        if (requests != null) {
            requests.release();
        }
    }

    private ViewportBody execute(ViewportBounds bounds, ParkingLotViewportRequest request, DayOfWeek day,
                                  ViewportDeadline deadline, ViewportObservation observation) {
        long coverStarted = System.nanoTime();
        List<Long> cells = properties.isProjectionOnly() ? List.of() : cover.cover(bounds);
        metrics.time("cover", coverStarted);
        if (!cells.isEmpty()) {
            for (int attempt = 0; attempt < 2; attempt++) {
                List<ViewportCellKey> keys;
                if (properties.isVersionCheckEnabled()) {
                    ViewportVersion version = repository.version(deadline);
                    if (version == null || !version.ready()
                            || version.gridSizeMeters() != properties.getGridSizeMeters()) {
                        break;
                    }
                    keys = cells.stream().map(cell -> new ViewportCellKey(properties.getEnvironment(),
                            properties.getSchema(), properties.getPolicy(), version, cell)).toList();
                } else {
                    keys = cells.stream().map(cell -> ViewportCellKey.ttlOnly(properties.getEnvironment(),
                            properties.getSchema(), properties.getPolicy(), properties.getGridSizeMeters(), cell))
                            .toList();
                }
                observation.eligible();
                try {
                    long cacheStarted = System.nanoTime();
                    Map<ViewportCellKey, ViewportCell> hits;
                    boolean bypassStore = false;
                    try {
                        hits = store.getMany(keys, deadline);
                        observation.firstLookup(keys.size(), hits.size());
                    } catch (ViewportStoreBudgetException budget) {
                        metrics.count("store", "get_failure", 1);
                        metrics.count("store", "initial_get_failure", 1);
                        metrics.count("store", "initial_get_budget", 1);
                        throw budget;
                    } catch (ViewportStoreException failure) {
                        metrics.count("store", "get_failure", 1);
                        metrics.count("store", "initial_get_failure", 1);
                        observation.firstLookupFailed();
                        metrics.count("store", "bypass_initial", 1);
                        hits = Map.of();
                        bypassStore = true;
                    } finally {
                        metrics.time("cache_initial", cacheStarted);
                    }
                    deadline.requireRemaining();
                    List<ViewportCellLoader.Result> loaded = loader.resolve(keys, hits, deadline, observation,
                            bypassStore);
                    long mergeStarted = System.nanoTime();
                    try {
                        return assemble(loaded, bounds, request, day);
                    } catch (ViewportStoreException failure) {
                        // Preserve the existing get_failure aggregate while exposing the actual stage.
                        metrics.count("store", "get_failure", 1);
                        metrics.count("store", "assemble_failure", 1);
                        break;
                    } finally {
                        metrics.time("merge_filter", mergeStarted);
                    }
                } catch (ViewportVersionChangedException changed) {
                    if (!properties.isVersionCheckEnabled()) {
                        // A missing/unready/mismatched projection cannot be repaired by rereading its revision.
                        break;
                    }
                    observation.retry();
                } catch (ViewportStoreBudgetException budget) {
                    break;
                } catch (ViewportStoreException bypass) {
                    // The loader also reports failures from owner rechecks before propagating limits.
                    break;
                } catch (ViewportCellTooLargeException bypass) {
                    metrics.count("requests", "oversize_bypass", 1);
                    break;
                }
            }
        }
        observation.fallback();
        CompletableFuture<ViewportBody> future = repository.fallback(bounds, request, day.getValue(), deadline,
                observation::sourceStarted);
        observation.track(future);
        try {
            return future.get(deadline.remainingNanos(), TimeUnit.NANOSECONDS);
        } catch (InterruptedException failure) {
            future.thenAccept(ViewportBody::close);
            future.cancel(false);
            Thread.currentThread().interrupt();
            throw new ViewportUnavailableException("viewport 응답 대기가 중단되었습니다.", failure);
        } catch (TimeoutException failure) {
            future.thenAccept(ViewportBody::close);
            future.cancel(false);
            throw new ViewportUnavailableException("viewport 응답 deadline을 초과했습니다.", failure);
        } catch (ExecutionException failure) {
            throw new ViewportUnavailableException("viewport 전체 응답을 준비할 수 없습니다.", failure.getCause());
        }
    }

    private ViewportBody assemble(List<ViewportCellLoader.Result> cells, ViewportBounds bounds,
                                   ParkingLotViewportRequest request, DayOfWeek day) {
        long heap = cells.stream().map(ViewportCellLoader.Result::cell)
                .mapToLong(ViewportCell::estimatedHeapBytes).sum();
        long items = cells.stream().map(ViewportCellLoader.Result::cell).mapToLong(cell -> cell.items().size()).sum();
        // Reserve room for boxed dedup IDs, hash entries, response records, list copies and sort workspace.
        long assemblyHeap = heap + items * 256L + cells.size() * 256L + 1024;
        if (assemblyHeap > properties.getMaxRequestBytes()) {
            throw new ViewportCellTooLargeException();
        }
        Set<Long> ids = new HashSet<>();
        List<ParkingLotViewportResponse> rows = new ArrayList<>();
        for (ViewportCellLoader.Result result : cells) {
            for (ViewportItem item : result.cell().items()) {
                if (!ids.add(item.id())) {
                    throw new ViewportStoreException("여러 셀에 중복된 주차장입니다.");
                }
                if (item.matches(bounds, request, day)) {
                    rows.add(new ParkingLotViewportResponse(item.id(), item.latitude(), item.longitude(),
                            scores.calculate(item.capacity())));
                }
            }
        }
        rows.sort(Comparator.comparingLong(ParkingLotViewportResponse::id));
        return new ViewportBody(ParkingLotViewportResponses.from(rows), () -> { });
    }
}
