package jumin.domain.parking.viewport;

import jakarta.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import jumin.config.ViewportCacheProperties;
import org.springframework.stereotype.Component;

@Component
public class ViewportCellLoader implements AutoCloseable {

    private record FlightKey(ViewportCellKey key, UUID lane) { }
    private record Loaded(ViewportCell cell, boolean fromSource) { }

    private final ViewportCellStore store;
    private final ViewportReadRepository repository;
    private final ViewportCacheProperties properties;
    private final ViewportMetrics metrics;
    private final Map<FlightKey, CompletableFuture<Loaded>> flights = new ConcurrentHashMap<>();
    private final Semaphore slots;
    private volatile boolean closed;
    private final ThreadPoolExecutor jobs;
    private final ThreadPoolExecutor writes;

    public ViewportCellLoader(ViewportCellStore store, ViewportReadRepository repository,
                              ViewportCacheProperties properties, ViewportMetrics metrics) {
        this.store = store;
        this.repository = repository;
        this.properties = properties;
        this.metrics = metrics;
        slots = new Semaphore(properties.getMaxInflightCells());
        jobs = new ThreadPoolExecutor(properties.getLoaderThreads(), properties.getLoaderThreads(), 0,
                TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(properties.getLoaderQueue()),
                task -> daemonThread(task, "viewport-cell-owner"), new ThreadPoolExecutor.AbortPolicy());
        writes = new ThreadPoolExecutor(properties.getLoaderThreads(), properties.getLoaderThreads(), 0,
                TimeUnit.MILLISECONDS, new SynchronousQueue<>(),
                task -> daemonThread(task, "viewport-cell-write"), new ThreadPoolExecutor.AbortPolicy());
        registerMetrics();
    }

    private Thread daemonThread(Runnable task, String name) {
        Thread thread = new Thread(task, name);
        thread.setDaemon(true);
        return thread;
    }

    private void registerMetrics() {
        metrics.registry().gauge("parking.viewport.loader.flights", flights, Map::size);
        metrics.registry().gauge("parking.viewport.loader.active", jobs, ThreadPoolExecutor::getActiveCount);
        metrics.registry().gauge("parking.viewport.loader.queued", jobs, executor -> executor.getQueue().size());
        metrics.registry().gauge("parking.viewport.cache.write.active", writes, ThreadPoolExecutor::getActiveCount);
    }

    public List<ViewportCellLoadResult> resolve(List<ViewportCellKey> keys, Map<ViewportCellKey, ViewportCell> hits,
                                ViewportDeadline deadline, ViewportObservation observation) {
        return resolve(keys, hits, deadline, observation, false);
    }

    public List<ViewportCellLoadResult> resolve(List<ViewportCellKey> keys, Map<ViewportCellKey, ViewportCell> hits,
                                ViewportDeadline deadline, ViewportObservation observation, boolean bypassStore) {
        Resolution resolution = new Resolution(newLane());
        try {
            registerMissing(keys, hits, resolution);
            requireOpen();
            if (!resolution.owned.isEmpty()) {
                startOwned(Map.copyOf(resolution.owned), observation, bypassStore);
                resolution.owned.clear();
            }
            return collectResults(keys, hits, resolution, deadline, observation);
        } catch (RuntimeException | Error failure) {
            failOwnedBatch(resolution.owned, failure);
            throw failure;
        }
    }

    private UUID newLane() {
        if (properties.isSingleflight()) {
            return null;
        }
        return UUID.randomUUID();
    }

    private void registerMissing(List<ViewportCellKey> keys, Map<ViewportCellKey, ViewportCell> hits,
                                 Resolution resolution) {
        for (ViewportCellKey key : keys) {
            if (hits.containsKey(key)) {
                continue;
            }
            FlightKey flightKey = new FlightKey(key, resolution.lane);
            CompletableFuture<Loaded> future = flights.computeIfAbsent(flightKey,
                    ignored -> claimFlight(flightKey, resolution));
            if (!resolution.ownKeys.contains(key)) {
                metrics.count("flights", "follower_registered", 1);
            }
            resolution.waiting.put(key, future);
        }
    }

    private CompletableFuture<Loaded> claimFlight(FlightKey key, Resolution resolution) {
        if (!slots.tryAcquire()) {
            throw ViewportFailureReason.CELL_FLIGHT_LIMIT.failure();
        }
        CompletableFuture<Loaded> candidate = new CompletableFuture<>();
        resolution.owned.put(key, candidate);
        resolution.ownKeys.add(key.key());
        return candidate;
    }

    private List<ViewportCellLoadResult> collectResults(List<ViewportCellKey> keys, Map<ViewportCellKey, ViewportCell> hits,
                                       Resolution resolution, ViewportDeadline deadline,
                                       ViewportObservation observation) {
        List<ViewportCellLoadResult> result = new ArrayList<>(keys.size());
        for (ViewportCellKey key : keys) {
            ViewportCell hit = hits.get(key);
            if (hit != null) {
                result.add(new ViewportCellLoadResult(hit, false, false));
                continue;
            }
            Loaded loaded = await(resolution.waiting.get(key), deadline);
            boolean shared = !resolution.ownKeys.contains(key);
            observation.consume(loaded.fromSource(), shared);
            result.add(new ViewportCellLoadResult(loaded.cell(), loaded.fromSource(), shared));
        }
        return List.copyOf(result);
    }

    private void requireOpen() {
        if (closed) {
            throw ViewportFailureReason.CELL_LOADER_CLOSED.failure();
        }
    }

    private void startOwned(Map<FlightKey, CompletableFuture<Loaded>> batch, ViewportObservation observation,
                            boolean bypassStore) {
        LoadJob job = new LoadJob(batch, observation, bypassStore);
        observation.track(job.completion);
        try {
            jobs.execute(job);
        } catch (RejectedExecutionException failure) {
            job.cancel(rejectionReason());
        }
    }

    private ViewportFailureReason rejectionReason() {
        if (closed || jobs.isShutdown()) {
            return ViewportFailureReason.CELL_LOADER_CLOSED;
        }
        return ViewportFailureReason.CELL_LOADER_QUEUE_FULL;
    }

    private final class LoadJob implements Runnable {
        private final Map<FlightKey, CompletableFuture<Loaded>> batch;
        private final ViewportObservation observation;
        private final boolean bypassStore;
        private final ViewportDeadline deadline = ViewportDeadline.after(properties.getRequestTimeout());
        private final CompletableFuture<Void> completion = new CompletableFuture<>();

        private LoadJob(Map<FlightKey, CompletableFuture<Loaded>> batch, ViewportObservation observation,
                        boolean bypassStore) {
            this.batch = batch;
            this.observation = observation;
            this.bypassStore = bypassStore;
        }

        @Override
        public void run() {
            Map<FlightKey, CompletableFuture<Loaded>> missing = new LinkedHashMap<>(batch);
            try {
                requireOpen();
                deadline.requireRemaining();
                Map<ViewportCellKey, ViewportCell> rechecked = recheck();
                metrics.count("cells", "recheck_hit", rechecked.size());
                completeRechecked(missing, rechecked);
                if (missing.isEmpty()) {
                    return;
                }
                loadMissing(Map.copyOf(missing));
            } catch (Throwable failure) {
                completeBatch(missing, null, failure, deadline, observation);
                if (failure instanceof Error fatal) {
                    throw fatal;
                }
            } finally {
                completion.complete(null);
            }
        }

        private Map<ViewportCellKey, ViewportCell> recheck() {
            if (bypassStore) {
                return Map.of();
            }
            long started = System.nanoTime();
            try {
                return store.getMany(batch.keySet().stream().map(FlightKey::key).toList(), deadline);
            } catch (ViewportStoreBudgetException budget) {
                recordRecheckFailure();
                metrics.count("store", "recheck_budget", 1);
                throw budget;
            } catch (ViewportStoreException failure) {
                recordRecheckFailure();
                observation.storeBypassed();
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

        private void completeRechecked(Map<FlightKey, CompletableFuture<Loaded>> missing,
                                        Map<ViewportCellKey, ViewportCell> rechecked) {
            for (FlightKey key : batch.keySet()) {
                if (!rechecked.containsKey(key.key())) {
                    continue;
                }
                CompletableFuture<Loaded> future = missing.remove(key);
                future.complete(new Loaded(rechecked.get(key.key()), false));
                remove(key, future);
            }
        }

        private void loadMissing(Map<FlightKey, CompletableFuture<Loaded>> sourceBatch) {
            deadline.requireRemaining();
            CompletableFuture<Map<ViewportCellKey, ViewportCell>> loading = repository.load(
                    sourceBatch.keySet().stream().map(FlightKey::key).toList(), deadline, observation::sourceStarted);
            observation.track(loading);
            loading.whenComplete((loaded, failure) ->
                    completeBatch(sourceBatch, loaded, failure, deadline, observation));
        }

        private void cancel(ViewportFailureReason reason) {
            completeBatch(batch, null, reason.failure(), deadline, observation);
            completion.complete(null);
        }
    }

    private void completeBatch(Map<FlightKey, CompletableFuture<Loaded>> batch,
                               Map<ViewportCellKey, ViewportCell> loaded, Throwable failure,
                               ViewportDeadline deadline, ViewportObservation observation) {
        boolean handedOff = false;
        CompletableFuture<Void> writeCompletion = new CompletableFuture<>();
        try {
            if (failure != null) {
                failBatch(batch, failure);
                return;
            }
            requireCompleteBatch(batch, loaded);
            deadline.requireRemaining();
            observation.track(writeCompletion);
            batch.forEach((key, future) -> future.complete(new Loaded(loaded.get(key.key()), true)));
            handedOff = submitWrite(batch, loaded, deadline, writeCompletion);
        } catch (Throwable callbackFailure) {
            failBatch(batch, callbackFailure);
        } finally {
            if (!handedOff) {
                finishWrite(batch, writeCompletion);
            }
        }
    }

    private void requireCompleteBatch(Map<FlightKey, CompletableFuture<Loaded>> batch,
                                      Map<ViewportCellKey, ViewportCell> loaded) {
        if (loaded == null || batch.keySet().stream().anyMatch(key -> !loaded.containsKey(key.key()))) {
            throw ViewportFailureReason.CELL_INCOMPLETE_BATCH.failure();
        }
    }

    private boolean submitWrite(Map<FlightKey, CompletableFuture<Loaded>> batch,
                                Map<ViewportCellKey, ViewportCell> loaded, ViewportDeadline deadline,
                                CompletableFuture<Void> completion) {
        if (closed) {
            return false;
        }
        try {
            writes.execute(() -> persistBatch(batch, loaded, deadline, completion));
            return true;
        } catch (RejectedExecutionException writeFailure) {
            metrics.count("store", "put_saturated", 1);
            return false;
        }
    }

    private void persistBatch(Map<FlightKey, CompletableFuture<Loaded>> batch,
                              Map<ViewportCellKey, ViewportCell> loaded, ViewportDeadline deadline,
                              CompletableFuture<Void> completion) {
        long started = System.nanoTime();
        try {
            if (closed) {
                return;
            }
            deadline.requireRemaining();
            store.putMany(List.copyOf(loaded.values()), deadline);
        } catch (RuntimeException writeFailure) {
            metrics.count("store", "put_failure", 1);
        } finally {
            metrics.time("cache_write", started);
            finishWrite(batch, completion);
        }
    }

    private void finishWrite(Map<FlightKey, CompletableFuture<Loaded>> batch, CompletableFuture<Void> completion) {
        batch.forEach(this::remove);
        completion.complete(null);
    }

    private void failBatch(Map<FlightKey, CompletableFuture<Loaded>> batch, Throwable failure) {
        batch.forEach(this::remove);
        batch.values().forEach(future -> future.completeExceptionally(failure));
    }

    private void failOwnedBatch(Map<FlightKey, CompletableFuture<Loaded>> batch, Throwable failure) {
        batch.forEach((key, future) -> {
            future.completeExceptionally(failure);
            remove(key, future);
        });
    }

    private void remove(FlightKey key, CompletableFuture<Loaded> future) {
        if (flights.remove(key, future)) {
            slots.release();
        }
    }

    private Loaded await(CompletableFuture<Loaded> future, ViewportDeadline deadline) {
        try {
            deadline.requireRemaining();
            Loaded loaded = future.get(deadline.remainingNanos(), TimeUnit.NANOSECONDS);
            deadline.requireRemaining();
            return loaded;
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            throw ViewportFailureReason.UNCLASSIFIED.failure(failure);
        } catch (TimeoutException failure) {
            throw ViewportFailureReason.UNCLASSIFIED.failure(failure);
        } catch (ExecutionException failure) {
            Throwable cause = failure.getCause();
            if (cause instanceof RuntimeException runtime) {
                throw runtime;
            }
            throw ViewportFailureReason.UNCLASSIFIED.failure(cause);
        }
    }

    @PreDestroy
    public void close() {
        closed = true;
        jobs.shutdownNow().forEach(task -> ((LoadJob) task).cancel(ViewportFailureReason.CELL_LOADER_CLOSED));
        writes.shutdownNow();
        flights.forEach((key, future) -> {
            future.completeExceptionally(ViewportFailureReason.CELL_LOADER_CLOSED.failure());
            remove(key, future);
        });
    }

    private static final class Resolution {
        private final UUID lane;
        private final Map<FlightKey, CompletableFuture<Loaded>> owned = new LinkedHashMap<>();
        private final Map<ViewportCellKey, CompletableFuture<Loaded>> waiting = new LinkedHashMap<>();
        private final Set<ViewportCellKey> ownKeys = new HashSet<>();

        private Resolution(UUID lane) {
            this.lane = lane;
        }
    }
}
