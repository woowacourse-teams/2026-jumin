package jumin.domain.parking.viewport;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import io.micrometer.core.instrument.Gauge;
import jakarta.annotation.PreDestroy;
import java.sql.SQLException;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import java.util.function.Predicate;
import javax.sql.DataSource;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.viewport.ViewportUnavailableException.Reason;
import org.postgresql.PGConnection;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.TransactionSystemException;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class ViewportDbAccess {

    private record UncertainSession(int pid, String stage) { }

    private final HikariDataSource pool;
    private final HikariDataSource observerPool;
    private final JdbcTemplate observerJdbc;
    private final String readUsername;
    private final String observerUsername;
    private final ViewportConnectionAttempts connectionAttempts;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final Semaphore permits;
    private final AtomicInteger active = new AtomicInteger();
    private final Map<String, AtomicInteger> activeByStage = new ConcurrentHashMap<>();
    private final Map<UUID, UncertainSession> uncertain = new ConcurrentHashMap<>();
    private final ScheduledExecutorService observer;
    private final ViewportDbWorkQueue workers;
    private final ViewportMetrics metrics;
    private final int roleOid;
    private final int maxSource;
    private final boolean enabled;
    private final AtomicLong unknownConnection;
    private final AtomicLong connectionFailures = new AtomicLong();

    @Autowired
    public ViewportDbAccess(JdbcTemplate primaryJdbc, ViewportCacheProperties properties, ViewportMetrics metrics) {
        DataSource primary = primaryJdbc.getDataSource();
        if (!(primary instanceof HikariDataSource hikari)) {
            throw new IllegalStateException("viewport 읽기 격리는 HikariDataSource 설정을 요구합니다.");
        }
        this.metrics = metrics;
        unknownConnection = new AtomicLong();
        properties.validate();
        maxSource = properties.getMaxConcurrentDb();
        enabled = properties.isEnabled();
        readUsername = properties.getReadUsername();
        observerUsername = properties.getObserverUsername();
        roleOid = enabled ? verifyRole(primaryJdbc, readUsername, maxSource) : 0;
        if (enabled) {
            verifyRole(primaryJdbc, properties.getObserverUsername(), 1);
            Boolean boundedAuth = primaryJdbc.queryForObject("""
                    SELECT current_setting('authentication_timeout')::interval <= interval '5 seconds'
                    """, Boolean.class);
            if (!Boolean.TRUE.equals(boundedAuth)) {
                throw new IllegalStateException("캐시 읽기 격리는 DB authentication_timeout <= 5s를 요구합니다.");
            }
        }
        HikariConfig readerConfig = ViewportReadPoolConfiguration.create(hikari, properties);
        connectionAttempts = new ViewportConnectionAttempts(readerConfig, unknownConnection);
        readerConfig.setDataSource(connectionAttempts);
        pool = new HikariDataSource(readerConfig);
        observerPool = new HikariDataSource(ViewportReadPoolConfiguration.observer(hikari, properties));
        observerJdbc = new JdbcTemplate(observerPool);
        jdbc = new JdbcTemplate(pool);
        jdbc.setFetchSize(128);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(pool));
        transaction.setReadOnly(true);
        if (enabled) {
            try {
                String actualReadRole = transaction.execute(status -> jdbc.queryForObject("SELECT current_user", String.class));
                String actualObserverRole = observerJdbc.queryForObject("SELECT current_user", String.class);
                if (!readUsername.equals(actualReadRole) || !properties.getObserverUsername().equals(actualObserverRole)) {
                    throw new IllegalStateException("viewport 전용 계정의 실제 인증 결과가 설정과 다릅니다.");
                }
                // The narrow definer function exposes no query text and fails closed if its owner lacks stats access.
                observerJdbc.queryForObject("SELECT public.viewport_cache_sessions_pending(?::name, ?::name)",
                        Boolean.class, readUsername, observerUsername);
            } catch (RuntimeException failure) {
                pool.close();
                observerPool.close();
                throw new IllegalStateException("viewport 전용 읽기/관측 계정의 시작 검증에 실패했습니다.", failure);
            }
        }
        permits = new Semaphore(maxSource);
        workers = new ViewportDbWorkQueue(maxSource, properties.getEffectiveMetadataDbWorkers(),
                properties.getDbQueue(), properties.getMetadataDbQueue(), metrics);
        observer = Executors.newSingleThreadScheduledExecutor(task -> {
            Thread thread = new Thread(task, "viewport-db-session-observer");
            thread.setDaemon(true);
            return thread;
        });
        observer.scheduleWithFixedDelay(this::observeUncertainSessions, 1, 1, TimeUnit.SECONDS);
        registerGauges();
    }

    // Isolates connection lifecycle tests from PostgreSQL and Spring application startup.
    ViewportDbAccess(JdbcTemplate jdbc, TransactionTemplate transaction, HikariDataSource pool,
                     ViewportConnectionAttempts connectionAttempts, AtomicLong unknownConnection,
                     ViewportCacheProperties properties, ViewportMetrics metrics) {
        this.pool = pool;
        this.observerPool = null;
        this.observerJdbc = null;
        this.readUsername = null;
        this.observerUsername = null;
        this.connectionAttempts = connectionAttempts;
        this.unknownConnection = unknownConnection;
        this.jdbc = jdbc;
        this.transaction = transaction;
        this.metrics = metrics;
        this.roleOid = 1;
        this.maxSource = properties.getMaxConcurrentDb();
        this.enabled = true;
        this.permits = new Semaphore(maxSource);
        this.workers = new ViewportDbWorkQueue(maxSource, properties.getEffectiveMetadataDbWorkers(),
                properties.getDbQueue(), properties.getMetadataDbQueue(), metrics);
        this.observer = null;
        registerGauges();
    }

    private void registerGauges() {
        Gauge.builder("parking.viewport.db.active", active, AtomicInteger::get).register(metrics.registry());
        for (String stage : List.of("version", "source", "fallback")) {
            Gauge.builder("parking.viewport.db.stage.active", stageActive(stage), AtomicInteger::get)
                    .tag("stage", stage).register(metrics.registry());
        }
        Gauge.builder("parking.viewport.db.uncertain", uncertain, Map::size).register(metrics.registry());
        metrics.registry().gauge("parking.viewport.db.unknown", unknownConnection, AtomicLong::get);
        metrics.registry().gauge("parking.viewport.db.connection_creating", connectionAttempts,
                attempts -> attempts.snapshot().inFlight());
    }

    public <T> T read(String stage, ViewportDeadline deadline, Function<JdbcTemplate, T> query) {
        CompletableFuture<T> future = readAsync(stage, deadline, query);
        try {
            return future.get(deadline.remainingNanos(), TimeUnit.NANOSECONDS);
        } catch (InterruptedException failure) {
            future.cancel(false);
            Thread.currentThread().interrupt();
            throw new ViewportUnavailableException(Reason.DB_DEADLINE, "viewport 요청이 중단되었습니다.", failure);
        } catch (TimeoutException failure) {
            future.cancel(false);
            throw new ViewportUnavailableException(Reason.DB_DEADLINE, "viewport DB 결과 대기 deadline을 초과했습니다.", failure);
        } catch (ExecutionException failure) {
            if (failure.getCause() instanceof RuntimeException runtime) {
                throw runtime;
            }
            throw new ViewportUnavailableException("viewport DB 조회에 실패했습니다.", failure.getCause());
        }
    }

    public <T> CompletableFuture<T> readAsync(String stage, ViewportDeadline deadline,
                                             Function<JdbcTemplate, T> query) {
        return workers.submit(stage, deadline, () -> readSync(stage, deadline, query));
    }

    private <T> T readSync(String stage, ViewportDeadline deadline, Function<JdbcTemplate, T> query) {
        requireDbRemaining(deadline);
        if (!enabled || unknownConnection.get() != 0) {
            throw new ViewportUnavailableException(Reason.DB_CONNECTION_FENCED,
                    "읽기 연결의 안전 상태가 확인되지 않아 조회를 차단합니다.");
        }
        if (!permits.tryAcquire()) {
            metrics.count("db", "rejected", 1);
            throw new ViewportUnavailableException(Reason.DB_ADMISSION_REJECTED, "viewport DB admission 한도를 초과했습니다.");
        }
        active.incrementAndGet();
        stageActive(stage).incrementAndGet();
        long started = System.nanoTime();
        AtomicInteger backendPid = new AtomicInteger();
        AtomicBoolean callbackEntered = new AtomicBoolean();
        AtomicReference<T> produced = new AtomicReference<>();
        boolean quarantine = false;
        boolean acquisitionStarted = false;
        try {
            if (unknownConnection.get() != 0) {
                throw new ViewportUnavailableException(Reason.DB_CONNECTION_FENCED, "읽기 연결 상태를 재확인해야 합니다.");
            }
            T completed;
            acquisitionStarted = true;
            if (stage.equals("version")) {
                // A single primary metadata SELECT has its own atomic snapshot. It needs no
                // explicit BEGIN/COMMIT, while retaining the same physical lease and fencing.
                completed = jdbc.execute((ConnectionCallback<T>) connection -> {
                    callbackEntered.set(true);
                    backendPid.set(connection.unwrap(PGConnection.class).getBackendPID());
                    requireDbRemaining(deadline);
                    if (!connection.getAutoCommit()) {
                        throw new ViewportUnavailableException("metadata 조회는 autocommit 연결을 요구합니다.");
                    }
                    JdbcTemplate metadataJdbc = new JdbcTemplate(new SingleConnectionDataSource(connection, true));
                    metadataJdbc.setFetchSize(jdbc.getFetchSize());
                    metadataJdbc.setQueryTimeout(jdbc.getQueryTimeout());
                    T value = query.apply(metadataJdbc);
                    produced.set(value);
                    requireDbRemaining(deadline);
                    return value;
                });
            } else {
                completed = transaction.execute(status -> {
                    callbackEntered.set(true);
                    try {
                        backendPid.set(DataSourceUtils.getConnection(pool).unwrap(PGConnection.class).getBackendPID());
                    } catch (SQLException failure) {
                        throw new ViewportUnavailableException("viewport DB 연결 식별에 실패했습니다.", failure);
                    }
                    requireDbRemaining(deadline);
                    Boolean acquired = jdbc.queryForObject("""
                        SELECT EXISTS (
                            SELECT 1 FROM generate_series(0, ?) AS slots(slot)
                            WHERE pg_try_advisory_xact_lock(?, 1448083456 + slot)
                            LIMIT 1)
                        """, Boolean.class, maxSource - 1, roleOid);
                    if (!Boolean.TRUE.equals(acquired)) {
                        metrics.count("db", "server_admission_rejected", 1);
                        throw new ViewportUnavailableException(Reason.DB_ADMISSION_REJECTED,
                                "이전 세대 작업을 포함한 DB 실행 한도를 초과했습니다.");
                    }
                    metrics.count("sql", "server_admission", 1);
                    requireDbRemaining(deadline);
                    T value = query.apply(jdbc);
                    produced.set(value);
                    requireDbRemaining(deadline);
                    return value;
                });
            }
            requireDbRemaining(deadline);
            produced.set(null);
            return completed;
        } catch (RuntimeException | Error failure) {
            if (produced.getAndSet(null) instanceof AutoCloseable resource) {
                try {
                    resource.close();
                } catch (Exception closeFailure) {
                    failure.addSuppressed(closeFailure);
                }
            }
            if (backendPid.get() != 0 && (hasConnectionFailure(failure) || hasTransactionFailure(failure))) {
                quarantine = true;
                uncertain.put(UUID.randomUUID(), new UncertainSession(backendPid.get(), stage));
                metrics.count("db", "uncertain", 1);
            } else if (backendPid.get() == 0 && unknownConnectionNeeded(acquisitionStarted,
                    callbackEntered.get(), failure, connectionAttempts.snapshot())) {
                unknownConnection.accumulateAndGet(connectionFailures.incrementAndGet(), Math::max);
                metrics.count("db", "connection_unknown_fenced", 1);
            }
            if (failure instanceof ViewportUnavailableException unavailable
                    && unavailable.getReason() == Reason.UNCLASSIFIED
                    && (deadline.remainingNanos() == 0 || Thread.currentThread().isInterrupted())) {
                throw new ViewportUnavailableException(Reason.DB_DEADLINE, failure.getMessage(), failure);
            }
            throw failure;
        } finally {
            metrics.time(stage, started);
            if (!quarantine) {
                active.decrementAndGet();
                stageActive(stage).decrementAndGet();
                permits.release();
            }
        }
    }

    private static void requireDbRemaining(ViewportDeadline deadline) {
        try {
            deadline.requireRemaining();
        } catch (ViewportUnavailableException failure) {
            throw new ViewportUnavailableException(Reason.DB_DEADLINE, failure.getMessage(), failure);
        }
    }

    static boolean hasConnectionFailure(Throwable failure) {
        return anyFailure(failure, cause -> cause instanceof SQLException sql && sql.getSQLState() != null
                && sql.getSQLState().startsWith("08"));
    }

    private static boolean hasTransactionFailure(Throwable failure) {
        return anyFailure(failure, TransactionSystemException.class::isInstance);
    }

    static boolean unknownConnectionNeeded(boolean acquisitionStarted, boolean callbackEntered, Throwable failure,
                                           ViewportConnectionAttempts.Snapshot physical) {
        if (!acquisitionStarted) {
            // In particular, the second check of an existing fence did not try to get a lease.
            return false;
        }
        if (hasConnectionFailure(failure) || hasTransactionFailure(failure)) {
            return true;
        }
        if (callbackEntered) {
            // The lease was obtained and the callback failed without a connection or rollback failure.
            return false;
        }
        if (physical.inFlight() != 0) {
            return true;
        }
        // A completed authentication or permission rejection is a definite failure, not
        // evidence of an orphaned backend. Other acquisition failures remain conservative.
        return !anyFailure(failure, cause -> cause instanceof SQLException sql && sql.getSQLState() != null
                && (sql.getSQLState().startsWith("28") || sql.getSQLState().equals("42501")));
    }

    private static boolean anyFailure(Throwable failure, Predicate<Throwable> matches) {
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        ArrayDeque<Throwable> pending = new ArrayDeque<>();
        pending.add(failure);
        while (!pending.isEmpty()) {
            Throwable cause = pending.removeFirst();
            if (!seen.add(cause)) {
                continue;
            }
            if (matches.test(cause)) {
                return true;
            }
            if (cause instanceof TransactionSystemException transactionFailure
                    && transactionFailure.getApplicationException() != null) {
                pending.add(transactionFailure.getApplicationException());
            }
            if (cause instanceof SQLException sql && sql.getNextException() != null) {
                pending.add(sql.getNextException());
            }
            if (cause.getCause() != null) {
                pending.add(cause.getCause());
            }
            Collections.addAll(pending, cause.getSuppressed());
        }
        return false;
    }

    private AtomicInteger stageActive(String stage) {
        return activeByStage.computeIfAbsent(stage, ignored -> new AtomicInteger());
    }

    JdbcTemplate jdbc() {
        return jdbc;
    }

    private void observeUncertainSessions() {
        for (Map.Entry<UUID, UncertainSession> entry : uncertain.entrySet()) {
            try {
                Boolean running = observerJdbc.queryForObject("""
                        SELECT EXISTS (SELECT 1 FROM pg_stat_activity
                        WHERE pid = ?)
                        """, Boolean.class, entry.getValue().pid());
                if (Boolean.FALSE.equals(running) && uncertain.remove(entry.getKey()) != null) {
                    active.decrementAndGet();
                    stageActive(entry.getValue().stage()).decrementAndGet();
                    permits.release();
                }
            } catch (RuntimeException ignored) {
                metrics.count("db", "observer_unavailable", 1);
                return;
            }
        }
        long observedGeneration = unknownConnection.get();
        if (observedGeneration != 0) {
            ViewportConnectionAttempts.Snapshot physical = connectionAttempts.snapshot();
            if (active.get() != 0 || physical.inFlight() != 0) {
                return;
            }
            try {
                pool.getHikariPoolMXBean().softEvictConnections();
                Boolean otherSessions = observerJdbc.queryForObject(
                        "SELECT public.viewport_cache_sessions_pending(?::name, ?::name)",
                        Boolean.class, readUsername, observerUsername);
                if (Boolean.FALSE.equals(otherSessions)
                        && connectionAttempts.clearIfUnchanged(physical, observedGeneration, () -> active.get() == 0)) {
                    metrics.count("db", "connection_fence_cleared", 1);
                } else if (Boolean.TRUE.equals(otherSessions)) {
                    metrics.count("db", "connection_server_pending", 1);
                }
            } catch (RuntimeException ignored) {
                metrics.count("db", "observer_unavailable", 1);
                return;
            }
        }
    }

    private int verifyRole(JdbcTemplate primary, String username, int limit) {
        String writerRole = primary.queryForObject("SELECT current_user", String.class);
        if (username.equals(writerRole)) {
            throw new IllegalStateException("viewport 읽기 계정은 원본 writer 계정과 달라야 합니다.");
        }
        return primary.query("SELECT oid, rolsuper, rolcanlogin, rolconnlimit FROM pg_roles WHERE rolname = ?",
                rows -> {
                    if (!rows.next() || rows.getBoolean("rolsuper") || !rows.getBoolean("rolcanlogin")
                            || rows.getInt("rolconnlimit") != limit) {
                        throw new IllegalStateException("전용 읽기 계정의 NOSUPERUSER/CONNECTION LIMIT를 확인하세요.");
                    }
                    return (int) rows.getLong("oid");
                }, username);
    }

    @PreDestroy
    public void close() {
        workers.close();
        if (observer != null) {
            observer.shutdownNow();
        }
        pool.close();
        if (observerPool != null) {
            observerPool.close();
        }
    }
}
