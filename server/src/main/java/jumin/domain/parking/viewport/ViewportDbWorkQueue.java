package jumin.domain.parking.viewport;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ForkJoinPool;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import jumin.domain.parking.viewport.ViewportUnavailableException.Reason;

/** Bounded DB workers. Metadata can reserve workers without increasing the DB budget. */
final class ViewportDbWorkQueue implements AutoCloseable {

    private static final List<String> STAGES = List.of("version", "source", "fallback");

    private final Object lifecycle = new Object();
    private final Map<ViewportDbFuture<?>, ReadTask<?>> pending = new ConcurrentHashMap<>();
    private final ThreadPoolExecutor source;
    private final ThreadPoolExecutor metadata;
    private final ScheduledThreadPoolExecutor deadlines;
    private final ViewportMetrics metrics;
    private boolean closed;

    ViewportDbWorkQueue(int maxWorkers, int metadataWorkers, int sourceQueue, int metadataQueue,
                        ViewportMetrics metrics) {
        this.metrics = metrics;
        int reserved = Math.min(metadataWorkers, Math.max(0, maxWorkers - 1));
        source = executor(maxWorkers - reserved, sourceQueue, "viewport-db-read");
        metadata = reserved == 0 ? source : executor(reserved, metadataQueue, "viewport-db-metadata");
        deadlines = new ScheduledThreadPoolExecutor(1, task -> {
            Thread thread = new Thread(task, "viewport-db-deadline");
            thread.setDaemon(true);
            return thread;
        });
        deadlines.setRemoveOnCancelPolicy(true);
        deadlines.setExecuteExistingDelayedTasksAfterShutdownPolicy(false);

        metrics.registry().gauge("parking.viewport.db.pending", pending, Map::size);
        Gauge.builder("parking.viewport.db.queued", this, ViewportDbWorkQueue::queued).register(metrics.registry());
        metrics.registry().gauge("parking.viewport.db.deadline.pending", deadlines, executor -> executor.getQueue().size());
        for (String stage : STAGES) {
            Gauge.builder("parking.viewport.db.stage.queued", this, queue -> queue.queued(stage))
                    .tag("stage", stage).register(metrics.registry());
        }
    }

    private static ThreadPoolExecutor executor(int workers, int capacity, String name) {
        return new ThreadPoolExecutor(workers, workers, 0, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(capacity), task -> {
                    Thread thread = new Thread(task, name);
                    thread.setDaemon(true);
                    return thread;
                }, new ThreadPoolExecutor.AbortPolicy());
    }

    <T> ViewportDbFuture<T> submit(String stage, Callable<T> work) {
        return submit(stage, null, work);
    }

    <T> ViewportDbFuture<T> submit(String stage, ViewportDeadline deadline, Callable<T> work) {
        ViewportDbFuture<T> future = new ViewportDbFuture<>();
        ThreadPoolExecutor executor = stage.equals("version") ? metadata : source;
        ReadTask<T> task = new ReadTask<>(future, stage, deadline, work, executor);
        future.onCancel(task::cancelQueued);
        boolean rejected = false;
        boolean shutdown;
        synchronized (lifecycle) {
            shutdown = closed;
            if (!shutdown) {
                pending.put(future, task);
                try {
                    executor.execute(task);
                    if (deadline != null) {
                        task.setExpiration(deadlines.schedule(task::expireQueued,
                                deadline.remainingNanos(), TimeUnit.NANOSECONDS));
                    }
                } catch (RejectedExecutionException failure) {
                    pending.remove(future);
                    rejected = true;
                }
            }
        }
        if (shutdown || rejected) {
            if (rejected) {
                metrics.count("db", "queue_rejected", 1);
                Counter.builder("parking.viewport.db.stage.rejected").tag("stage", stage)
                        .register(metrics.registry()).increment();
            }
            future.completeExceptionally(new ViewportUnavailableException(
                    shutdown ? Reason.DB_SHUTTING_DOWN : Reason.DB_QUEUE_FULL,
                    shutdown ? "viewport DB 작업을 종료합니다." : "viewport DB 작업 큐가 가득 찼습니다."));
            future.workCompletion().complete(null);
        }
        return future;
    }

    private int queued() {
        return source.getQueue().size() + (metadata == source ? 0 : metadata.getQueue().size());
    }

    private int queued(String stage) {
        ThreadPoolExecutor executor = stage.equals("version") ? metadata : source;
        return (int) executor.getQueue().stream().filter(task -> ((ReadTask<?>) task).stage.equals(stage)).count();
    }

    @Override
    public void close() {
        List<Runnable> queuedSource;
        List<Runnable> queuedMetadata;
        List<ViewportDbFuture<?>> outstanding;
        synchronized (lifecycle) {
            if (closed) {
                return;
            }
            closed = true;
            queuedSource = source.shutdownNow();
            queuedMetadata = metadata == source ? List.of() : metadata.shutdownNow();
            deadlines.shutdownNow();
            outstanding = List.copyOf(pending.keySet());
        }
        // A running job keeps its workCompletion open until it exits, even though
        // callers must stop waiting for its result during shutdown.
        queuedSource.forEach(task -> ((ReadTask<?>) task).finishQueued());
        queuedMetadata.forEach(task -> ((ReadTask<?>) task).finishQueued());
        outstanding.forEach(future -> future.completeExceptionally(
                new ViewportUnavailableException(Reason.DB_SHUTTING_DOWN, "viewport DB 작업을 종료합니다.")));
    }

    private final class ReadTask<T> implements Runnable {
        private final ViewportDbFuture<T> future;
        private final String stage;
        private final ViewportDeadline deadline;
        private final Callable<T> work;
        private final ThreadPoolExecutor executor;
        private final AtomicBoolean claimed = new AtomicBoolean();
        private volatile ScheduledFuture<?> expiration;

        private ReadTask(ViewportDbFuture<T> future, String stage, ViewportDeadline deadline,
                         Callable<T> work, ThreadPoolExecutor executor) {
            this.future = future;
            this.stage = stage;
            this.deadline = deadline;
            this.work = work;
            this.executor = executor;
        }

        @Override
        public void run() {
            if (!claimed.compareAndSet(false, true)) {
                return;
            }
            cancelExpiration();
            try {
                if (!future.isDone()) {
                    if (deadline != null && deadline.remainingNanos() == 0) {
                        throw deadlineFailure();
                    }
                    T result = work.call();
                    if (!future.complete(result) && result instanceof AutoCloseable resource) {
                        resource.close();
                    }
                }
            } catch (Throwable failure) {
                future.completeExceptionally(failure);
                if (failure instanceof Error fatal) {
                    throw fatal;
                }
            } finally {
                pending.remove(future);
                future.workCompletion().complete(null);
            }
        }

        private void cancelQueued() {
            if (executor.remove(this)) {
                finishQueued();
            }
        }

        private void expireQueued() {
            if (executor.remove(this) && finishQueued()) {
                future.completeExceptionally(deadlineFailure());
            }
        }

        private ViewportUnavailableException deadlineFailure() {
            return new ViewportUnavailableException(Reason.DB_DEADLINE, "viewport DB 작업 대기 deadline을 초과했습니다.");
        }

        private void setExpiration(ScheduledFuture<?> expiration) {
            this.expiration = expiration;
            if (claimed.get()) {
                expiration.cancel(false);
            }
        }

        private void cancelExpiration() {
            ScheduledFuture<?> scheduled = expiration;
            if (scheduled != null) {
                scheduled.cancel(false);
            }
        }

        private boolean finishQueued() {
            if (claimed.compareAndSet(false, true)) {
                pending.remove(future);
                cancelExpiration();
                // Both result and workCompletion callbacks may synchronously join the
                // other signal. Deliver one on a separate executor to avoid that cycle.
                future.workCompletion().completeAsync(() -> null, ForkJoinPool.commonPool());
                return true;
            }
            return false;
        }
    }
}
