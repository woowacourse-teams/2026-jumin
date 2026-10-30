package jumin.domain.parking.viewport;

import io.micrometer.core.instrument.Gauge;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
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
    private final Semaphore permits;
    private final AtomicInteger active = new AtomicInteger();
    private final Map<String, AtomicInteger> activeByStage = new ConcurrentHashMap<>();
    private final ViewportDbWorkQueue workers;
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
        permits = new Semaphore(properties.getMaxConcurrentDb());
        workers = new ViewportDbWorkQueue(properties.getMaxConcurrentDb(), properties.getDbQueue(), metrics);
        registerGauges();
    }

    private void registerGauges() {
        Gauge.builder("parking.viewport.db.active", active, AtomicInteger::get).register(metrics.registry());
        for (String stage : List.of("source", "fallback")) {
            Gauge.builder("parking.viewport.db.stage.active", stageActive(stage), AtomicInteger::get)
                    .tag("stage", stage).register(metrics.registry());
        }
    }

    public <T> T read(String stage, ViewportDeadline deadline, Function<JdbcTemplate, T> query) {
        CompletableFuture<T> future = readAsync(stage, deadline, query);
        try {
            return future.get(deadline.remainingNanos(), TimeUnit.NANOSECONDS);
        } catch (InterruptedException failure) {
            future.cancel(false);
            Thread.currentThread().interrupt();
            throw ViewportFailureReason.DB_DEADLINE.failure(failure);
        } catch (TimeoutException failure) {
            future.cancel(false);
            throw ViewportFailureReason.DB_DEADLINE.failure(failure);
        } catch (ExecutionException failure) {
            if (failure.getCause() instanceof RuntimeException runtime) {
                throw runtime;
            }
            throw ViewportFailureReason.UNCLASSIFIED.failure(failure.getCause());
        }
    }

    public <T> CompletableFuture<T> readAsync(String stage, ViewportDeadline deadline,
                                             Function<JdbcTemplate, T> query) {
        return workers.submit(stage, deadline, () -> readSync(stage, deadline, query));
    }

    private <T> T readSync(String stage, ViewportDeadline deadline, Function<JdbcTemplate, T> query) {
        requireDbRemaining(deadline);
        if (!permits.tryAcquire()) {
            metrics.count("db", "rejected", 1);
            throw ViewportFailureReason.DB_ADMISSION_REJECTED.failure();
        }
        active.incrementAndGet();
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
            active.decrementAndGet();
            stageActive(stage).decrementAndGet();
            permits.release();
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
        workers.close();
    }
}
