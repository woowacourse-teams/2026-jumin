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
import jumin.global.exception.BusinessException;

final class ViewportDbWorkQueue implements AutoCloseable {

    private static final List<String> STAGES = List.of("source", "fallback");

    private final Object lifecycle = new Object();
    private final Map<ViewportDbFuture<?>, ReadTask<?>> pending = new ConcurrentHashMap<>();
    private final ThreadPoolExecutor executor;
    private final ScheduledThreadPoolExecutor deadlines;
    private final ViewportMetrics metrics;
    private boolean closed;

    ViewportDbWorkQueue(int maxWorkers, int queueCapacity, ViewportMetrics metrics) {
        this.metrics = metrics;
        executor = executor(maxWorkers, queueCapacity, "viewport-db-read");
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
        ReadTask<T> task = new ReadTask<>(future, stage, deadline, work);
        future.onCancel(task::cancelQueued);
        boolean rejected = false;
        boolean shutdown;
        synchronized (lifecycle) {
            shutdown = closed;
            if (!shutdown) {
                rejected = !enqueue(future, task, deadline);
            }
        }
        if (shutdown) {
            completeRejected(future, ViewportFailureReason.DB_SHUTTING_DOWN);
            return future;
        }
        if (rejected) {
            metrics.count("db", "queue_rejected", 1);
            Counter.builder("parking.viewport.db.stage.rejected").tag("stage", stage)
                    .register(metrics.registry()).increment();
            completeRejected(future, ViewportFailureReason.DB_QUEUE_FULL);
        }
        return future;
    }

    private <T> boolean enqueue(ViewportDbFuture<T> future, ReadTask<T> task, ViewportDeadline deadline) {
        pending.put(future, task);
        try {
            executor.execute(task);
            if (deadline != null) {
                task.setExpiration(deadlines.schedule(task::expireQueued,
                        deadline.remainingNanos(), TimeUnit.NANOSECONDS));
            }
            return true;
        } catch (RejectedExecutionException failure) {
            pending.remove(future);
            return false;
        }
    }

    private static void completeRejected(ViewportDbFuture<?> future, ViewportFailureReason reason) {
        future.completeExceptionally(reason.failure());
        future.workCompletion().complete(null);
    }

    private int queued() {
        return executor.getQueue().size();
    }

    private int queued(String stage) {
        return (int) executor.getQueue().stream().filter(task -> ((ReadTask<?>) task).stage.equals(stage)).count();
    }

    @Override
    public void close() {
        List<Runnable> queued;
        List<ViewportDbFuture<?>> outstanding;
        synchronized (lifecycle) {
            if (closed) {
                return;
            }
            closed = true;
            queued = executor.shutdownNow();
            deadlines.shutdownNow();
            outstanding = List.copyOf(pending.keySet());
        }
        queued.forEach(task -> ((ReadTask<?>) task).finishQueued());
        outstanding.forEach(future -> future.completeExceptionally(ViewportFailureReason.DB_SHUTTING_DOWN.failure()));
    }

    private final class ReadTask<T> implements Runnable {
        private final ViewportDbFuture<T> future;
        private final String stage;
        private final ViewportDeadline deadline;
        private final Callable<T> work;
        private final AtomicBoolean claimed = new AtomicBoolean();
        private volatile ScheduledFuture<?> expiration;

        private ReadTask(ViewportDbFuture<T> future, String stage, ViewportDeadline deadline, Callable<T> work) {
            this.future = future;
            this.stage = stage;
            this.deadline = deadline;
            this.work = work;
        }

        @Override
        public void run() {
            if (!claimed.compareAndSet(false, true)) {
                return;
            }
            cancelExpiration();
            try {
                if (future.isDone()) {
                    return;
                }
                if (deadline != null && deadline.remainingNanos() == 0) {
                    throw deadlineFailure();
                }
                T result = work.call();
                if (!future.complete(result) && result instanceof AutoCloseable resource) {
                    resource.close();
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

        private BusinessException deadlineFailure() {
            return ViewportFailureReason.DB_DEADLINE.failure();
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
            if (!claimed.compareAndSet(false, true)) {
                return false;
            }
            pending.remove(future);
            cancelExpiration();
            future.workCompletion().completeAsync(() -> null, ForkJoinPool.commonPool());
            return true;
        }
    }
}
