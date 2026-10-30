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
import org.springframework.transaction.TransactionException;
import org.springframework.transaction.annotation.Propagation;
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
        requests = requestLimit(maximumRequests);
        metrics.registry().gauge("parking.viewport.requests.active", activeRequests);
        metrics.registry().gauge("parking.viewport.requests.limit", this, service -> service.maximumRequests);
    }

    private Semaphore requestLimit(int maximum) {
        if (maximum == 0) {
            return null;
        }
        return new Semaphore(maximum);
    }

    public ViewportBody search(ParkingLotViewportRequest request) {
        ViewportBounds bounds = boundsFrom(request);
        if (!properties.isEnabled()) {
            return new ViewportBody(legacy.searchViewport(request));
        }
        ViewportObservation observation = new ViewportObservation(metrics);
        acquireRequest();
        try {
            return searchAdmitted(bounds, request, observation);
        } catch (RuntimeException | Error failure) {
            finishRequest(observation, false);
            if (failure instanceof DataAccessException || failure instanceof TransactionException) {
                throw ViewportFailureReason.UNCLASSIFIED.failure(failure);
            }
            throw failure;
        }
    }

    private ViewportBounds boundsFrom(ParkingLotViewportRequest request) {
        try {
            return ViewportBounds.from(request);
        } catch (IllegalArgumentException failure) {
            throw new BusinessException(ErrorCode.INVALID_INPUT);
        }
    }

    private void acquireRequest() {
        if (requests != null && !requests.tryAcquire()) {
            metrics.count("requests", "admission_rejected", 1);
            throw ViewportFailureReason.UNCLASSIFIED.failure();
        }
        activeRequests.incrementAndGet();
    }

    private ViewportBody searchAdmitted(ViewportBounds bounds, ParkingLotViewportRequest request,
                                       ViewportObservation observation) {
        ViewportDeadline deadline = ViewportDeadline.after(properties.getRequestTimeout());
        DayOfWeek day = LocalDate.ofInstant(clock.instant(), SEOUL).getDayOfWeek();
        ViewportBody body = execute(bounds, request, day, deadline, observation);
        if (deadline.remainingNanos() == 0) {
            body.close();
            deadline.requireRemaining();
        }
        return body.onCompletion(success -> finishRequest(observation, success));
    }

    private void finishRequest(ViewportObservation observation, boolean success) {
        try {
            observation.finish(success);
        } finally {
            releaseRequest();
        }
    }

    private void releaseRequest() {
        activeRequests.decrementAndGet();
        if (requests == null) {
            return;
        }
        requests.release();
    }

    private ViewportBody execute(ViewportBounds bounds, ParkingLotViewportRequest request, DayOfWeek day,
                                 ViewportDeadline deadline, ViewportObservation observation) {
        List<Long> cells = coveredCells(bounds);
        if (cells.isEmpty()) {
            return fallback(bounds, request, day, deadline, observation);
        }
        try {
            return searchCells(cells, bounds, request, day, deadline, observation);
        } catch (ViewportFallbackException bypass) {
            if (bypass.isCellTooLarge()) {
                metrics.count("requests", "oversize_bypass", 1);
            }
            return fallback(bounds, request, day, deadline, observation);
        } catch (ViewportStoreBudgetException bypass) {
            return fallback(bounds, request, day, deadline, observation);
        } catch (ViewportStoreException bypass) {
            metrics.count("store", "assemble_failure", 1);
            return fallback(bounds, request, day, deadline, observation);
        }
    }

    private List<Long> coveredCells(ViewportBounds bounds) {
        long started = System.nanoTime();
        List<Long> cells = cover.cover(bounds);
        metrics.time("cover", started);
        return cells;
    }

    private ViewportBody searchCells(List<Long> cells, ViewportBounds bounds, ParkingLotViewportRequest request,
                                     DayOfWeek day, ViewportDeadline deadline, ViewportObservation observation) {
        List<ViewportCellKey> keys = cells.stream().map(cell -> new ViewportCellKey(properties.getEnvironment(),
                properties.getSchema(), properties.getPolicy(), properties.getGridSizeMeters(), cell)).toList();
        observation.eligible();
        CacheLookup lookup = lookup(keys, deadline, observation);
        deadline.requireRemaining();
        List<ViewportCellLoadResult> loaded = loader.resolve(keys, lookup.hits(), deadline, observation,
                lookup.bypassStore());
        long started = System.nanoTime();
        try {
            return assemble(loaded, bounds, request, day);
        } finally {
            metrics.time("merge_filter", started);
        }
    }

    private CacheLookup lookup(List<ViewportCellKey> keys, ViewportDeadline deadline, ViewportObservation observation) {
        long started = System.nanoTime();
        try {
            Map<ViewportCellKey, ViewportCell> hits = store.getMany(keys, deadline);
            observation.firstLookup(keys.size(), hits.size());
            return new CacheLookup(hits, false);
        } catch (ViewportStoreBudgetException budget) {
            recordInitialLookupFailure();
            metrics.count("store", "initial_get_budget", 1);
            throw budget;
        } catch (ViewportStoreException failure) {
            recordInitialLookupFailure();
            observation.firstLookupFailed();
            metrics.count("store", "bypass_initial", 1);
            return new CacheLookup(Map.of(), true);
        } finally {
            metrics.time("cache_initial", started);
        }
    }

    private void recordInitialLookupFailure() {
        metrics.count("store", "get_failure", 1);
        metrics.count("store", "initial_get_failure", 1);
    }

    private ViewportBody fallback(ViewportBounds bounds, ParkingLotViewportRequest request, DayOfWeek day,
                                  ViewportDeadline deadline, ViewportObservation observation) {
        observation.fallback();
        CompletableFuture<ViewportBody> future = repository.fallback(bounds, request, day.getValue(), deadline,
                observation::sourceStarted);
        observation.track(future);
        try {
            return future.get(deadline.remainingNanos(), TimeUnit.NANOSECONDS);
        } catch (InterruptedException failure) {
            future.cancel(false);
            Thread.currentThread().interrupt();
            throw ViewportFailureReason.UNCLASSIFIED.failure(failure);
        } catch (TimeoutException failure) {
            future.cancel(false);
            throw ViewportFailureReason.UNCLASSIFIED.failure(failure);
        } catch (ExecutionException failure) {
            throw ViewportFailureReason.UNCLASSIFIED.failure(failure.getCause());
        }
    }

    private ViewportBody assemble(List<ViewportCellLoadResult> cells, ViewportBounds bounds,
                                  ParkingLotViewportRequest request, DayOfWeek day) {
        requireAssemblyBudget(cells);
        Set<Long> ids = new HashSet<>();
        List<ParkingLotViewportResponse> rows = new ArrayList<>();
        for (ViewportCellLoadResult result : cells) {
            appendMatchingItems(result.cell(), bounds, request, day, ids, rows);
        }
        rows.sort(Comparator.comparingLong(ParkingLotViewportResponse::id));
        return new ViewportBody(ParkingLotViewportResponses.from(rows));
    }

    private void requireAssemblyBudget(List<ViewportCellLoadResult> cells) {
        long heap = cells.stream().map(ViewportCellLoadResult::cell)
                .mapToLong(ViewportCell::estimatedHeapBytes).sum();
        long items = cells.stream().map(ViewportCellLoadResult::cell).mapToLong(cell -> cell.items().size()).sum();
        long assemblyHeap = heap + items * 256L + cells.size() * 256L + 1024;
        if (assemblyHeap > properties.getMaxRequestBytes()) {
            throw ViewportFallbackException.cellTooLarge();
        }
    }

    private void appendMatchingItems(ViewportCell cell, ViewportBounds bounds, ParkingLotViewportRequest request,
                                     DayOfWeek day, Set<Long> ids, List<ParkingLotViewportResponse> rows) {
        for (ViewportItem item : cell.items()) {
            if (!ids.add(item.id())) {
                throw new ViewportStoreException("여러 셀에 중복된 주차장입니다.");
            }
            if (!item.matches(bounds, request, day)) {
                continue;
            }
            rows.add(new ParkingLotViewportResponse(item.id(), item.latitude(), item.longitude(),
                    scores.calculate(item.capacity())));
        }
    }

    private record CacheLookup(Map<ViewportCellKey, ViewportCell> hits, boolean bypassStore) { }
}
