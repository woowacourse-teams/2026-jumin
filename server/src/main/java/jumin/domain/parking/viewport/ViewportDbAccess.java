package jumin.domain.parking.viewport;

import io.micrometer.core.instrument.Gauge;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Function;
import javax.sql.DataSource;
import jumin.config.ViewportCacheProperties;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class ViewportDbAccess {

    private final JdbcTemplate jdbc;
    private final PlatformTransactionManager transactions;
    private final long dbTimeoutNanos;
    private final ReentrantLock admission = new ReentrantLock(true);
    private final Condition capacity = admission.newCondition();
    private final int maximum;
    private final int queueLimit;
    private final AtomicInteger queued = new AtomicInteger();
    private volatile boolean closed;
    private final AtomicInteger active = new AtomicInteger();
    private final Map<String, AtomicInteger> activeByStage = new ConcurrentHashMap<>();
    private final ViewportMetrics metrics;

    public ViewportDbAccess(JdbcTemplate primaryJdbc, ViewportCacheProperties properties, ViewportMetrics metrics) {
        properties.validate();
        DataSource source = Objects.requireNonNull(primaryJdbc.getDataSource(), "viewport DataSource is required");
        this.metrics = metrics;
        dbTimeoutNanos = properties.getDbTimeout().toNanos();
        jdbc = new JdbcTemplate(source);
        jdbc.setFetchSize(128);
        jdbc.setQueryTimeout(secondsCeiling(properties.getDbTimeout()));
        transactions = new DataSourceTransactionManager(source);
        maximum = properties.getMaxConcurrentDb();
        queueLimit = properties.getDbQueue();
        registerGauges();
    }

    private void registerGauges() {
        Gauge.builder("parking.viewport.db.active", active, AtomicInteger::get).register(metrics.registry());
        metrics.registry().gauge("parking.viewport.db.queued", queued);
        metrics.registry().gauge("parking.viewport.db.pending", this, access -> access.active.get() + access.queued.get());
        for (String stage : List.of("source", "fallback")) {
            Gauge.builder("parking.viewport.db.stage.active", stageActive(stage), AtomicInteger::get)
                    .tag("stage", stage).register(metrics.registry());
        }
    }

    public <T> T read(String stage, ViewportDeadline deadline, Function<JdbcTemplate, T> query) {
        acquire(deadline);
        stageActive(stage).incrementAndGet();
        long started = System.nanoTime();
        AtomicReference<T> produced = new AtomicReference<>();
        try {
            T completed = executeRead(deadline, query, produced);
            requireDbRemaining(deadline);
            produced.set(null);
            return completed;
        } catch (RuntimeException | Error failure) {
            closeProduced(produced, failure);
            if (isUnclassifiedDeadlineFailure(failure, deadline)) {
                throw ViewportFailureReason.DB_DEADLINE.failure(failure);
            }
            throw failure;
        } finally {
            metrics.time(stage, started);
            stageActive(stage).decrementAndGet();
            release();
        }
    }

    private void acquire(ViewportDeadline deadline) {
        admission.lock();
        try {
            requireOpen();
            requireDbRemaining(deadline);
            if (active.get() >= maximum) {
                if (queued.get() >= queueLimit) {
                    metrics.count("db", "queue_rejected", 1);
                    throw ViewportFailureReason.DB_QUEUE_FULL.failure();
                }
                queued.incrementAndGet();
                try {
                    while (active.get() >= maximum) {
                        requireOpen();
                        requireDbRemaining(deadline);
                        capacity.awaitNanos(deadline.remainingNanos());
                    }
                } catch (InterruptedException failure) {
                    Thread.currentThread().interrupt();
                    throw ViewportFailureReason.DB_DEADLINE.failure(failure);
                } finally {
                    queued.decrementAndGet();
                }
            }
            requireOpen();
            requireDbRemaining(deadline);
            active.incrementAndGet();
        } finally {
            admission.unlock();
        }
    }

    private void release() {
        admission.lock();
        try {
            active.decrementAndGet();
            capacity.signal();
        } finally {
            admission.unlock();
        }
    }

    private void requireOpen() {
        if (closed) {
            throw ViewportFailureReason.DB_SHUTTING_DOWN.failure();
        }
    }

    private <T> T executeRead(ViewportDeadline deadline, Function<JdbcTemplate, T> query,
                              AtomicReference<T> produced) {
        long remainingNanos = Math.min(deadline.remainingNanos(), dbTimeoutNanos);
        requireDbRemaining(deadline);
        TransactionTemplate transaction = new TransactionTemplate(transactions);
        transaction.setReadOnly(true);
        transaction.setTimeout(secondsCeiling(Duration.ofNanos(remainingNanos)));
        return transaction.execute(status -> queryInTransaction(deadline, query, produced));
    }

    private <T> T queryInTransaction(ViewportDeadline deadline, Function<JdbcTemplate, T> query,
                                      AtomicReference<T> produced) {
        requireDbRemaining(deadline);
        long timeoutMillis = Math.max(1, TimeUnit.NANOSECONDS.toMillis(
                Math.min(deadline.remainingNanos(), dbTimeoutNanos)));
        jdbc.execute("SET LOCAL statement_timeout = " + timeoutMillis);
        requireDbRemaining(deadline);
        T value = query.apply(jdbc);
        produced.set(value);
        requireDbRemaining(deadline);
        return value;
    }

    private static void closeProduced(AtomicReference<?> produced, Throwable failure) {
        if (!(produced.getAndSet(null) instanceof AutoCloseable resource)) {
            return;
        }
        try {
            resource.close();
        } catch (Exception closeFailure) {
            failure.addSuppressed(closeFailure);
        }
    }

    private static boolean isUnclassifiedDeadlineFailure(Throwable failure, ViewportDeadline deadline) {
        if (!(failure instanceof BusinessException exception)) {
            return false;
        }
        if (exception.getErrorCode() != ErrorCode.VIEWPORT_UNAVAILABLE) {
            return false;
        }
        String reason = exception.getReason();
        if (reason != null && !reason.equals(ViewportFailureReason.UNCLASSIFIED.name())) {
            return false;
        }
        return deadline.remainingNanos() == 0 || Thread.currentThread().isInterrupted();
    }

    private static int secondsCeiling(Duration duration) {
        long nanos = duration.toNanos();
        return (int) Math.max(1, 1 + (nanos - 1) / TimeUnit.SECONDS.toNanos(1));
    }

    private static void requireDbRemaining(ViewportDeadline deadline) {
        try {
            deadline.requireRemaining();
        } catch (BusinessException failure) {
            if (failure.getErrorCode() != ErrorCode.VIEWPORT_UNAVAILABLE) {
                throw failure;
            }
            throw ViewportFailureReason.DB_DEADLINE.failure(failure);
        }
    }

    private AtomicInteger stageActive(String stage) {
        return activeByStage.computeIfAbsent(stage, ignored -> new AtomicInteger());
    }

    JdbcTemplate jdbc() {
        return jdbc;
    }

    @PreDestroy
    public void close() {
        admission.lock();
        try {
            closed = true;
            capacity.signalAll();
        } finally {
            admission.unlock();
        }
    }
}
