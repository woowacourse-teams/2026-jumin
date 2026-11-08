package jumin.domain.parking.service;

import static jumin.config.ViewportCacheProperties.GRID_SIZE_METERS;
import static jumin.config.ViewportCacheProperties.MAX_REQUEST_BYTES;

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
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.cache.ViewportCellStore;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.domain.parking.dto.ParkingLotViewportResponse;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
import jumin.domain.parking.exception.ViewportFailureReason;
import jumin.domain.parking.exception.ViewportFallbackException;
import jumin.domain.parking.exception.ViewportStoreBudgetException;
import jumin.domain.parking.exception.ViewportStoreException;
import jumin.domain.parking.model.ViewportBounds;
import jumin.domain.parking.model.ViewportCell;
import jumin.domain.parking.model.ViewportCellKey;
import jumin.domain.parking.model.ViewportDeadline;
import jumin.domain.parking.model.ViewportItem;
import jumin.domain.parking.monitoring.ViewportMetrics;
import jumin.domain.parking.repository.ViewportRepository;
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
    private final ViewportCellCover cover;
    private final ViewportRepository repository;
    private final ViewportCellStore store;
    private final ViewportCellLoader loader;
    private final ViewportMetrics metrics;
    private final ParkingLodScoreCalculator scores;
    private final Clock clock;

    public ViewportSearchService(ViewportCacheProperties properties, ViewportCellCover cover,
                                 ViewportRepository repository,
                                 ViewportCellStore store, ViewportCellLoader loader, ViewportMetrics metrics,
                                 ParkingLodScoreCalculator scores, Clock clock) {
        this.properties = properties;
        this.cover = cover;
        this.repository = repository;
        this.store = store;
        this.loader = loader;
        this.metrics = metrics;
        this.scores = scores;
        this.clock = clock;
    }

    public ParkingLotViewportResponses search(ParkingLotViewportRequest request) {
        ViewportBounds bounds = ViewportBounds.from(request);
        try {
            return searchWithinDeadline(bounds, request);
        } catch (RuntimeException | Error failure) {
            if (failure instanceof DataAccessException || failure instanceof TransactionException) {
                throw ViewportFailureReason.UNCLASSIFIED.failure(failure);
            }
            throw failure;
        }
    }

    private ParkingLotViewportResponses searchWithinDeadline(ViewportBounds bounds, ParkingLotViewportRequest request) {
        ViewportDeadline deadline = ViewportDeadline.after(properties.getRequestTimeout());
        DayOfWeek day = LocalDate.ofInstant(clock.instant(), SEOUL).getDayOfWeek();
        ParkingLotViewportResponses response = execute(bounds, request, day, deadline);
        if (deadline.remainingNanos() == 0) {
            deadline.requireRemaining();
        }
        return response;
    }

    private ParkingLotViewportResponses execute(ViewportBounds bounds, ParkingLotViewportRequest request, DayOfWeek day,
                                 ViewportDeadline deadline) {
        if (!properties.isEnabled()) {
            return repository.findWithinBounds(bounds, request, day.getValue(), deadline);
        }
        List<Long> cells = coveredCells(bounds);
        if (cells.isEmpty()) {
            return fallback(bounds, request, day, deadline);
        }
        try {
            return searchCells(cells, bounds, request, day, deadline);
        } catch (ViewportFallbackException bypass) {
            if (bypass.isCellTooLarge()) {
                metrics.count("requests", "oversize_bypass", 1);
            }
            return fallback(bounds, request, day, deadline);
        } catch (ViewportStoreBudgetException bypass) {
            return fallback(bounds, request, day, deadline);
        } catch (ViewportStoreException bypass) {
            metrics.count("store", "assemble_failure", 1);
            return fallback(bounds, request, day, deadline);
        }
    }

    private List<Long> coveredCells(ViewportBounds bounds) {
        long started = System.nanoTime();
        List<Long> cells = cover.cover(bounds);
        metrics.time("cover", started);
        return cells;
    }

    private ParkingLotViewportResponses searchCells(List<Long> cells, ViewportBounds bounds, ParkingLotViewportRequest request,
                                     DayOfWeek day, ViewportDeadline deadline) {
        List<ViewportCellKey> keys = cells.stream()
                .map(cell -> new ViewportCellKey(properties.getEnvironment(), GRID_SIZE_METERS, cell))
                .toList();
        CacheLookup lookup = lookup(keys, deadline);
        deadline.requireRemaining();
        List<ViewportCell> loaded = loader.resolve(keys, lookup.hits(), deadline,
                lookup.bypassStore());
        long started = System.nanoTime();
        try {
            return assemble(loaded, bounds, request, day);
        } finally {
            metrics.time("merge_filter", started);
        }
    }

    private CacheLookup lookup(List<ViewportCellKey> keys, ViewportDeadline deadline) {
        long started = System.nanoTime();
        try {
            Map<ViewportCellKey, ViewportCell> hits = store.getMany(keys, deadline);
            metrics.count("cells", "hit", hits.size());
            metrics.count("cells", "miss", keys.size() - hits.size());
            return new CacheLookup(hits, false);
        } catch (ViewportStoreBudgetException budget) {
            recordInitialLookupFailure();
            metrics.count("store", "initial_get_budget", 1);
            throw budget;
        } catch (ViewportStoreException failure) {
            recordInitialLookupFailure();
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

    private ParkingLotViewportResponses fallback(ViewportBounds bounds, ParkingLotViewportRequest request, DayOfWeek day,
                                  ViewportDeadline deadline) {
        metrics.count("logical", "fallback", 1);
        return repository.findWithinBounds(bounds, request, day.getValue(), deadline);
    }

    private ParkingLotViewportResponses assemble(List<ViewportCell> cells, ViewportBounds bounds,
                                  ParkingLotViewportRequest request, DayOfWeek day) {
        requireAssemblyBudget(cells);
        Set<Long> ids = new HashSet<>();
        List<ParkingLotViewportResponse> rows = new ArrayList<>();
        for (ViewportCell cell : cells) {
            appendMatchingItems(cell, bounds, request, day, ids, rows);
        }
        rows.sort(Comparator.comparingLong(ParkingLotViewportResponse::id));
        return ParkingLotViewportResponses.from(rows);
    }

    private void requireAssemblyBudget(List<ViewportCell> cells) {
        long heap = cells.stream().mapToLong(ViewportCell::estimatedHeapBytes).sum();
        long items = cells.stream().mapToLong(cell -> cell.items().size()).sum();
        long assemblyHeap = heap + items * 256L + cells.size() * 256L + 1024;
        if (assemblyHeap > MAX_REQUEST_BYTES) {
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
            rows.add(ParkingLotViewportResponse.from(item, scores.calculate(item.capacity())));
        }
    }

    private record CacheLookup(Map<ViewportCellKey, ViewportCell> hits, boolean bypassStore) { }
}
