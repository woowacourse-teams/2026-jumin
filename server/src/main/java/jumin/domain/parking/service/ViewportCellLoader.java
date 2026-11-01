package jumin.domain.parking.service;

import jakarta.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.cache.ViewportCellStore;
import jumin.domain.parking.exception.ViewportFailureReason;
import jumin.domain.parking.exception.ViewportStoreBudgetException;
import jumin.domain.parking.exception.ViewportStoreException;
import jumin.domain.parking.model.ViewportCell;
import jumin.domain.parking.model.ViewportCellKey;
import jumin.domain.parking.model.ViewportDeadline;
import jumin.domain.parking.monitoring.ViewportMetrics;
import jumin.domain.parking.repository.ViewportRepository;
import org.springframework.stereotype.Component;

@Component
public class ViewportCellLoader implements AutoCloseable {

    private static final class CellLoad {
        private final ReentrantLock lock = new ReentrantLock();
        private int users;
        private ViewportCell result;
        private RuntimeException failure;
    }

    private final ViewportCellStore store;
    private final ViewportRepository repository;
    private final ViewportMetrics metrics;
    private final Map<ViewportCellKey, CellLoad> loads = new ConcurrentHashMap<>();
    private final Semaphore slots;
    private volatile boolean closed;

    public ViewportCellLoader(ViewportCellStore store, ViewportRepository repository,
                              ViewportCacheProperties properties, ViewportMetrics metrics) {
        this.store = store;
        this.repository = repository;
        this.metrics = metrics;
        slots = new Semaphore(properties.getMaxInflightCells());
        metrics.registerLoader(loads);
    }

    public List<ViewportCell> resolve(List<ViewportCellKey> keys, Map<ViewportCellKey, ViewportCell> hits,
                                     ViewportDeadline deadline) {
        return resolve(keys, hits, deadline, false);
    }

    public List<ViewportCell> resolve(List<ViewportCellKey> keys, Map<ViewportCellKey, ViewportCell> hits,
                                     ViewportDeadline deadline, boolean bypassStore) {
        Map<ViewportCellKey, CellLoad> registered = new LinkedHashMap<>();
        List<CellLoad> locked = new ArrayList<>();
        try {
            requireOpen();
            registerMissingCells(keys, hits, registered);
            acquireCellLocks(registered, locked, deadline);
            requireOpen();
            loadMissing(registered, deadline, bypassStore);
            List<ViewportCell> result = new ArrayList<>(keys.size());
            for (ViewportCellKey key : keys) {
                ViewportCell hit = hits.get(key);
                if (hit != null) {
                    result.add(hit);
                    continue;
                }
                result.add(registered.get(key).result);
            }
            deadline.requireRemaining();
            return List.copyOf(result);
        } catch (RuntimeException | Error failure) {
            RuntimeException reported = failure instanceof RuntimeException runtime
                    ? runtime : ViewportFailureReason.UNCLASSIFIED.failure(failure);
            locked.stream().filter(load -> load.result == null).forEach(load -> load.failure = reported);
            throw reported;
        } finally {
            for (int index = locked.size() - 1; index >= 0; index--) {
                locked.get(index).lock.unlock();
            }
            registered.forEach(this::unregister);
        }
    }

    private void registerMissingCells(List<ViewportCellKey> keys, Map<ViewportCellKey, ViewportCell> hits,
                                      Map<ViewportCellKey, CellLoad> registered) {
        for (ViewportCellKey key : keys) {
            if (hits.containsKey(key)) {
                continue;
            }
            registered.put(key, register(key));
        }
    }

    private void acquireCellLocks(Map<ViewportCellKey, CellLoad> registered, List<CellLoad> locked,
                                  ViewportDeadline deadline) {
        List<ViewportCellKey> ordered = registered.keySet().stream()
                .sorted(Comparator.comparing(ViewportCellKey::redisKey)).toList();
        for (ViewportCellKey key : ordered) {
            CellLoad load = registered.get(key);
            lock(load, deadline);
            locked.add(load);
            if (load.failure != null) {
                throw load.failure;
            }
        }
    }

    private CellLoad register(ViewportCellKey key) {
        return loads.compute(key, (ignored, current) -> {
            if (current != null) {
                metrics.count("flights", "follower_registered", 1);
                current.users++;
                return current;
            }
            if (!slots.tryAcquire()) {
                throw ViewportFailureReason.CELL_FLIGHT_LIMIT.failure();
            }
            CellLoad load = new CellLoad();
            load.users = 1;
            return load;
        });
    }

    private void unregister(ViewportCellKey key, CellLoad registered) {
        loads.computeIfPresent(key, (ignored, current) -> {
            if (current != registered) {
                return current;
            }
            if (--current.users != 0) {
                return current;
            }
            slots.release();
            return null;
        });
    }

    private void lock(CellLoad load, ViewportDeadline deadline) {
        try {
            while (!load.lock.tryLock(Math.min(deadline.remainingNanos(), TimeUnit.MILLISECONDS.toNanos(20)),
                    TimeUnit.NANOSECONDS)) {
                requireOpen();
                deadline.requireRemaining();
            }
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            throw ViewportFailureReason.UNCLASSIFIED.failure(failure);
        }
    }

    private void loadMissing(Map<ViewportCellKey, CellLoad> registered, ViewportDeadline deadline,
                             boolean bypassStore) {
        Map<ViewportCellKey, CellLoad> missing = new LinkedHashMap<>();
        registered.forEach((key, load) -> {
            if (load.result == null) {
                missing.put(key, load);
            }
        });
        if (missing.isEmpty()) {
            return;
        }
        Map<ViewportCellKey, ViewportCell> rechecked = recheck(List.copyOf(missing.keySet()), deadline,
                bypassStore);
        metrics.count("cells", "recheck_hit", rechecked.size());
        rechecked.forEach((key, cell) -> {
            CellLoad load = missing.remove(key);
            if (load != null) {
                load.result = cell;
            }
        });
        if (missing.isEmpty()) {
            return;
        }
        deadline.requireRemaining();
        Map<ViewportCellKey, ViewportCell> loaded = repository.load(List.copyOf(missing.keySet()), deadline);
        if (loaded == null || !loaded.keySet().containsAll(missing.keySet())) {
            throw ViewportFailureReason.CELL_INCOMPLETE_BATCH.failure();
        }
        requireOpen();
        deadline.requireRemaining();
        persist(loaded, deadline);
        missing.forEach((key, load) -> load.result = loaded.get(key));
    }

    private Map<ViewportCellKey, ViewportCell> recheck(List<ViewportCellKey> keys, ViewportDeadline deadline,
                                                     boolean bypassStore) {
        if (bypassStore) {
            return Map.of();
        }
        long started = System.nanoTime();
        try {
            return store.getMany(keys, deadline);
        } catch (ViewportStoreBudgetException budget) {
            recordRecheckFailure();
            metrics.count("store", "recheck_budget", 1);
            throw budget;
        } catch (ViewportStoreException failure) {
            recordRecheckFailure();
            metrics.count("store", "bypass_recheck", 1);
            return Map.of();
        } finally {
            metrics.time("cache_recheck", started);
        }
    }

    private void recordRecheckFailure() {
        metrics.count("store", "get_failure", 1);
        metrics.count("store", "recheck_failure", 1);
    }

    private void persist(Map<ViewportCellKey, ViewportCell> loaded, ViewportDeadline deadline) {
        long started = System.nanoTime();
        try {
            store.putMany(List.copyOf(loaded.values()), deadline);
        } catch (RuntimeException failure) {
            metrics.count("store", "put_failure", 1);
        } finally {
            metrics.time("cache_write", started);
        }
    }

    private void requireOpen() {
        if (closed) {
            throw ViewportFailureReason.CELL_LOADER_CLOSED.failure();
        }
    }

    @PreDestroy
    public void close() {
        closed = true;
    }
}
