package jumin.domain.parking.viewport;

import jakarta.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.SynchronousQueue;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.viewport.ViewportUnavailableException.Reason;
import org.springframework.stereotype.Component;

@Component
public class ViewportCellLoader implements AutoCloseable {

    public record Result(ViewportCell cell, boolean fromSource, boolean shared) { }
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
                TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(properties.getLoaderQueue()), task -> {
                    Thread thread = new Thread(task, "viewport-cell-owner");
                    thread.setDaemon(true);
                    return thread;
                }, new ThreadPoolExecutor.AbortPolicy());
        // No queue: retained write batches are limited to loaderThreads * maxRequestBytes.
        writes = new ThreadPoolExecutor(properties.getLoaderThreads(), properties.getLoaderThreads(), 0,
                TimeUnit.MILLISECONDS, new SynchronousQueue<>(), task -> {
                    Thread thread = new Thread(task, "viewport-cell-write");
                    thread.setDaemon(true);
                    return thread;
                }, new ThreadPoolExecutor.AbortPolicy());
        metrics.registry().gauge("parking.viewport.loader.flights", flights, Map::size);
        metrics.registry().gauge("parking.viewport.loader.active", jobs, ThreadPoolExecutor::getActiveCount);
        metrics.registry().gauge("parking.viewport.loader.queued", jobs, executor -> executor.getQueue().size());
        metrics.registry().gauge("parking.viewport.cache.write.active", writes, ThreadPoolExecutor::getActiveCount);
    }

    public List<Result> resolve(List<ViewportCellKey> keys, Map<ViewportCellKey, ViewportCell> hits,
                                ViewportDeadline deadline, ViewportObservation observation) {
        return resolve(keys, hits, deadline, observation, false);
    }

    public List<Result> resolve(List<ViewportCellKey> keys, Map<ViewportCellKey, ViewportCell> hits,
                                ViewportDeadline deadline, ViewportObservation observation, boolean bypassStore) {
        Map<FlightKey, CompletableFuture<Loaded>> owned = new LinkedHashMap<>();
        Map<ViewportCellKey, CompletableFuture<Loaded>> waiting = new LinkedHashMap<>();
        Set<ViewportCellKey> ownKeys = new HashSet<>();
        UUID lane = properties.isSingleflight() ? null : UUID.randomUUID();
        try {
            for (ViewportCellKey key : keys) {
                if (hits.containsKey(key)) {
                    continue;
                }
                FlightKey flightKey = new FlightKey(key, lane);
                CompletableFuture<Loaded> future = flights.computeIfAbsent(flightKey, ignored -> {
                    if (!slots.tryAcquire()) {
                        throw new ViewportUnavailableException(Reason.CELL_FLIGHT_LIMIT, "공유 셀 작업 한도를 초과했습니다.");
                    }
                    CompletableFuture<Loaded> candidate = new CompletableFuture<>();
                    owned.put(flightKey, candidate);
                    ownKeys.add(key);
                    return candidate;
                });
                if (!ownKeys.contains(key)) {
                    metrics.count("flights", "follower_registered", 1);
                }
                waiting.put(key, future);
            }
            if (closed) {
                throw new ViewportUnavailableException(Reason.CELL_LOADER_CLOSED, "공유 셀 로더를 종료합니다.");
            }
            if (!owned.isEmpty()) {
                startOwned(Map.copyOf(owned), observation, bypassStore);
                owned.clear();
            }
            List<Result> result = new ArrayList<>(keys.size());
            for (ViewportCellKey key : keys) {
                ViewportCell hit = hits.get(key);
                if (hit != null) {
                    result.add(new Result(hit, false, false));
                } else {
                    Loaded loaded = await(waiting.get(key), deadline);
                    // The owning batch is the one whose SQL callback belongs to this observation.
                    boolean shared = !ownKeys.contains(key);
                    observation.consume(loaded.fromSource(), shared);
                    result.add(new Result(loaded.cell(), loaded.fromSource(), shared));
                }
            }
            return List.copyOf(result);
        } catch (RuntimeException | Error failure) {
            owned.forEach((key, future) -> {
                future.completeExceptionally(failure);
                remove(key, future);
            });
            throw failure;
        }
    }

    private void startOwned(Map<FlightKey, CompletableFuture<Loaded>> batch, ViewportObservation observation,
                            boolean bypassStore) {
        LoadJob job = new LoadJob(batch, observation, bypassStore);
        observation.track(job.completion);
        try {
            jobs.execute(job);
        } catch (RejectedExecutionException failure) {
            job.cancel(closed || jobs.isShutdown() ? Reason.CELL_LOADER_CLOSED : Reason.CELL_LOADER_QUEUE_FULL);
        }
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
                if (closed) {
                    throw new ViewportUnavailableException(Reason.CELL_LOADER_CLOSED, "공유 셀 로더를 종료합니다.");
                }
                deadline.requireRemaining();
                Map<ViewportCellKey, ViewportCell> rechecked = Map.of();
                if (!bypassStore) {
                    long recheckStarted = System.nanoTime();
                    try {
                        rechecked = store.getMany(batch.keySet().stream().map(FlightKey::key).toList(), deadline);
                    } catch (ViewportStoreBudgetException budget) {
                        metrics.count("store", "get_failure", 1);
                        metrics.count("store", "recheck_failure", 1);
                        metrics.count("store", "recheck_budget", 1);
                        throw budget;
                    } catch (ViewportStoreException failure) {
                        metrics.count("store", "get_failure", 1);
                        metrics.count("store", "recheck_failure", 1);
                        observation.storeBypassed();
                        metrics.count("store", "bypass_recheck", 1);
                    } finally {
                        metrics.time("cache_recheck", recheckStarted);
                    }
                }
                metrics.count("cells", "recheck_hit", rechecked.size());
                for (FlightKey key : batch.keySet()) {
                    if (rechecked.containsKey(key.key())) {
                        CompletableFuture<Loaded> future = missing.remove(key);
                        future.complete(new Loaded(rechecked.get(key.key()), false));
                        remove(key, future);
                    }
                }
                if (!missing.isEmpty()) {
                    deadline.requireRemaining();
                    Map<FlightKey, CompletableFuture<Loaded>> sourceBatch = Map.copyOf(missing);
                    CompletableFuture<Map<ViewportCellKey, ViewportCell>> loading = repository.load(
                            sourceBatch.keySet().stream().map(FlightKey::key).toList(), deadline,
                            observation::sourceStarted);
                    observation.track(loading);
                    loading.whenComplete((loaded, failure) -> completeBatch(sourceBatch, loaded, failure, deadline, observation));
                }
            } catch (Throwable failure) {
                completeBatch(missing, null, failure, deadline, observation);
                if (failure instanceof Error fatal) {
                    throw fatal;
                }
            } finally {
                completion.complete(null);
            }
        }

        private void cancel(Reason reason) {
            completeBatch(batch, null, new ViewportUnavailableException(reason, "공유 셀 작업 큐를 사용할 수 없습니다."), deadline, observation);
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
                batch.forEach(this::remove);
                batch.values().forEach(future -> future.completeExceptionally(failure));
                return;
            }
            if (loaded == null || batch.keySet().stream().anyMatch(key -> !loaded.containsKey(key.key()))) {
                throw new ViewportUnavailableException(Reason.CELL_INCOMPLETE_BATCH, "불완전한 셀 batch를 반환할 수 없습니다.");
            }
            deadline.requireRemaining();
            observation.track(writeCompletion);
            batch.forEach((key, future) -> future.complete(new Loaded(loaded.get(key.key()), true)));
            try {
                if (closed) {
                    return;
                }
                writes.execute(() -> {
                    long putStarted = System.nanoTime();
                    try {
                        if (!closed) {
                            deadline.requireRemaining();
                            store.putMany(List.copyOf(loaded.values()), deadline);
                        }
                    } catch (RuntimeException writeFailure) {
                        metrics.count("store", "put_failure", 1);
                    } finally {
                        metrics.time("cache_write", putStarted);
                        batch.forEach(this::remove);
                        writeCompletion.complete(null);
                    }
                });
                handedOff = true;
            } catch (RejectedExecutionException writeFailure) {
                metrics.count("store", "put_saturated", 1);
            }
        } catch (Throwable callbackFailure) {
            batch.forEach(this::remove);
            batch.values().forEach(future -> future.completeExceptionally(callbackFailure));
        } finally {
            if (!handedOff) {
                batch.forEach(this::remove);
                writeCompletion.complete(null);
            }
        }
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
            throw new ViewportUnavailableException("공유 셀 결과 대기가 중단되었습니다.", failure);
        } catch (TimeoutException failure) {
            throw new ViewportUnavailableException("공유 셀 결과 대기 시간을 초과했습니다.", failure);
        } catch (ExecutionException failure) {
            Throwable cause = failure.getCause();
            if (cause instanceof RuntimeException runtime) {
                throw runtime;
            }
            throw new ViewportUnavailableException("공유 셀 조회에 실패했습니다.", cause);
        }
    }

    @PreDestroy
    public void close() {
        closed = true;
        jobs.shutdownNow().forEach(task -> ((LoadJob) task).cancel(Reason.CELL_LOADER_CLOSED));
        writes.shutdownNow();
        flights.forEach((key, future) -> {
            future.completeExceptionally(new ViewportUnavailableException(Reason.CELL_LOADER_CLOSED, "공유 셀 로더를 종료합니다."));
            remove(key, future);
        });
    }
}
