package jumin.domain.parking.viewport;

import io.lettuce.core.ClientOptions;
import io.lettuce.core.RedisClient;
import io.lettuce.core.RedisCommandExecutionException;
import io.lettuce.core.RedisCommandTimeoutException;
import io.lettuce.core.RedisConnectionException;
import io.lettuce.core.RedisException;
import io.lettuce.core.RedisURI;
import io.lettuce.core.ScriptOutputType;
import io.lettuce.core.SocketOptions;
import io.lettuce.core.SslOptions;
import io.lettuce.core.SslVerifyMode;
import io.lettuce.core.api.StatefulRedisConnection;
import io.lettuce.core.codec.ByteArrayCodec;
import io.lettuce.core.resource.DefaultClientResources;
import io.lettuce.core.protocol.ProtocolVersion;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.time.Duration;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Future;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import jumin.config.ViewportCacheProperties;

public class RedisViewportCellStore implements ViewportCellStore {

    private static final String READ = """
            local total = 0
            if #KEYS > tonumber(ARGV[3]) then return {-1} end
            for i = 1, #KEYS do
                local kind = redis.call('TYPE', KEYS[i]).ok
                if kind ~= 'none' and kind ~= 'string' then redis.call('UNLINK', KEYS[i]) end
                local size = redis.call('STRLEN', KEYS[i])
                if size > tonumber(ARGV[1]) then return {-1} end
                total = total + size
                if total > tonumber(ARGV[2]) then return {-1} end
            end
            local result = {}
            for i = 1, #KEYS do result[i] = redis.call('GET', KEYS[i]) or false end
            return result
            """;
    private static final String WRITE = """
            for i = 1, #KEYS do
                redis.call('SET', KEYS[i], ARGV[i * 2 - 1], 'PX', ARGV[i * 2])
            end
            return #KEYS
            """;

    private final ViewportCacheProperties properties;
    private final ViewportCellCodec codec;
    private final ViewportCellCover cover;
    private final ViewportMetrics metrics;
    private final DefaultClientResources resources;
    private final RedisClient client;
    private final RedisURI uri;
    private final ThreadPoolExecutor transport;
    private final ScheduledExecutorService watchdog = Executors.newSingleThreadScheduledExecutor(task -> {
        Thread thread = new Thread(task, "viewport-redis-deadline");
        thread.setDaemon(true);
        return thread;
    });
    private volatile StatefulRedisConnection<byte[], byte[]> connection;
    private CompletableFuture<StatefulRedisConnection<byte[], byte[]>> pendingConnect;
    private final ThreadPoolExecutor connector = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS,
            new ArrayBlockingQueue<>(1), task -> {
                Thread thread = new Thread(task, "viewport-redis-connect");
                thread.setDaemon(true);
                return thread;
            }, new ThreadPoolExecutor.AbortPolicy());
    private volatile long circuitUntil;
    private volatile boolean closed;
    private volatile CompletableFuture<Void> closing = CompletableFuture.completedFuture(null);

    public RedisViewportCellStore(ViewportCacheProperties properties, ViewportCellCodec codec,
                                  ViewportCellCover cover, ViewportMetrics metrics) {
        this.properties = properties;
        this.codec = codec;
        this.cover = cover;
        this.metrics = metrics;
        uri = redisUri(properties);
        uri.setTimeout(properties.getEffectiveRedisConnectTimeout());
        SslOptions tls = redisTls(properties, uri);
        resources = DefaultClientResources.builder().ioThreadPoolSize(2).computationThreadPoolSize(2).build();
        client = RedisClient.create(resources, uri);
        ClientOptions.Builder options = ClientOptions.builder().protocolVersion(ProtocolVersion.RESP2)
                .autoReconnect(false).requestQueueSize(16)
                .disconnectedBehavior(ClientOptions.DisconnectedBehavior.REJECT_COMMANDS)
                .socketOptions(SocketOptions.builder().connectTimeout(properties.getEffectiveRedisConnectTimeout()).build());
        if (tls != null) {
            options.sslOptions(tls);
        }
        client.setOptions(options.build());
        transport = new ThreadPoolExecutor(properties.getRedisTransportThreads(), properties.getRedisTransportThreads(), 0,
                TimeUnit.MILLISECONDS, new SynchronousQueue<>(), task -> {
                    Thread thread = new Thread(task, "viewport-redis-transport");
                    thread.setDaemon(true);
                    return thread;
                }, new ThreadPoolExecutor.AbortPolicy());
        metrics.registry().gauge("parking.viewport.redis.transport.active", transport, ThreadPoolExecutor::getActiveCount);
        metrics.registry().gauge("parking.viewport.redis.connect.pending", this, RedisViewportCellStore::pendingWork);
    }

    private static RedisURI redisUri(ViewportCacheProperties properties) {
        RedisURI parsed;
        try {
            URI input = URI.create(properties.getRedisUri());
            if (input.getRawUserInfo() != null
                    || (input.getRawAuthority() != null && input.getRawAuthority().contains("@"))) {
                throw new IllegalArgumentException();
            }
            parsed = RedisURI.create(input);
        } catch (RuntimeException invalid) {
            // URI parsing exceptions can include the input, including accidentally embedded credentials.
            throw new IllegalArgumentException("Redis URI 설정을 확인하세요. 인증정보는 별도로 지정해야 합니다.");
        }
        if (parsed.isSsl() && parsed.getVerifyMode() != SslVerifyMode.FULL) {
            throw new IllegalArgumentException("Redis TLS에는 인증서와 호스트 검증이 필요합니다.");
        }
        String username = properties.getRedisUsername();
        String password = properties.getRedisPassword();
        if (username != null || password != null) {
            if (username == null || username.isBlank() || password == null || password.isBlank()) {
                throw new IllegalArgumentException("Redis 사용자 이름과 비밀번호를 함께 설정하세요.");
            }
            parsed.setAuthentication(username, password);
        }
        return parsed;
    }

    private static SslOptions redisTls(ViewportCacheProperties properties, RedisURI uri) {
        String certificate = properties.getRedisTlsCaFile();
        if (certificate == null) {
            return null;
        }
        if (!uri.isSsl() || certificate.isBlank()) {
            throw new IllegalArgumentException("Redis TLS 인증서에는 TLS 연결과 유효한 파일이 필요합니다.");
        }
        try {
            Path path = Path.of(certificate);
            try (InputStream input = Files.newInputStream(path)) {
                if (CertificateFactory.getInstance("X.509").generateCertificates(input).isEmpty()) {
                    throw new IllegalArgumentException();
                }
            }
            // This trust manager is scoped to this Lettuce client; JVM default HTTPS trust is untouched.
            return SslOptions.builder().jdkSslProvider().trustManager(path.toFile()).build();
        } catch (IOException | CertificateException | RuntimeException invalid) {
            throw new IllegalArgumentException("Redis TLS 인증서 파일을 읽을 수 없습니다.");
        }
    }

    @Override
    public Map<ViewportCellKey, ViewportCell> getMany(List<ViewportCellKey> keys, ViewportDeadline deadline) {
        deadline.requireRemaining();
        if (keys.isEmpty()) {
            return Map.of();
        }
        validateBatch(keys.size());
        List<ViewportCellKey> batch = List.copyOf(keys);
        ViewportDeadline transportDeadline = ViewportDeadline.after(properties.getCacheTimeout());
        return execute(deadline, () -> readTransport(batch, transportDeadline), false);
    }

    private Map<ViewportCellKey, ViewportCell> readTransport(List<ViewportCellKey> keys, ViewportDeadline deadline) {
        long started = System.nanoTime();
        StatefulRedisConnection<byte[], byte[]> active = null;
        try {
            deadline.requireRemaining();
            active = connection(deadline);
            byte[][] encodedKeys = keys.stream().map(key -> text(key.redisKey())).toArray(byte[][]::new);
            deadline.requireRemaining();
            List<?> values = awaitCommand(active.async().eval(READ, ScriptOutputType.MULTI, encodedKeys,
                    text(properties.getMaxValueBytes()), text(properties.getMaxRequestBytes()),
                    text(properties.getMaxCells())), deadline, active);
            if (values.size() != keys.size() || values.stream().anyMatch(value -> value instanceof Number)) {
                metrics.count("store", "wire_budget_rejected", 1);
                throw new ViewportStoreBudgetException("원격 cache 응답 크기를 제한했습니다.");
            }
            Map<ViewportCellKey, ViewportCell> result = new LinkedHashMap<>();
            long heap = 0;
            for (int index = 0; index < keys.size(); index++) {
                deadline.requireRemaining();
                if (values.get(index) == null) {
                    continue;
                }
                ViewportCellKey key = keys.get(index);
                try {
                    ViewportCell cell = codec.decode(key, (byte[]) values.get(index), properties.getMaxRequestBytes() - heap);
                    for (ViewportItem item : cell.items()) {
                        deadline.requireRemaining();
                        if (!cover.belongsTo(item, key)) {
                            throw new IllegalArgumentException("다른 셀의 항목입니다.");
                        }
                    }
                    heap += cell.estimatedHeapBytes();
                    result.put(key, cell);
                } catch (IllegalArgumentException failure) {
                    metrics.count("store", "corrupt", 1);
                }
            }
            deadline.requireRemaining();
            return Map.copyOf(result);
        } catch (ViewportUnavailableException failure) {
            metrics.count("store_error", Thread.currentThread().isInterrupted() ? "interrupted" : "operation_timeout", 1);
            throw new ViewportStoreException("원격 cache 로컬 처리 예산을 초과했습니다.", failure);
        } catch (ViewportStoreBudgetException failure) {
            metrics.count("store_error", "budget", 1);
            throw failure;
        } catch (ViewportStoreException failure) {
            if (active != null && (!(failure instanceof CommandFailure) || !active.isOpen())) {
                failConnection(active);
            }
            throw failure;
        } catch (RuntimeException failure) {
            if (active != null && isCommandFailure(failure) && !hasConnectionFailure(active, failure)) {
                metrics.count("store_error", "command_error", 1);
            } else if (active != null) {
                metrics.count("store_error", hasConnectionFailure(active, failure) ? "connection_error" : "unknown", 1);
                failConnection(active);
            } else {
                metrics.count("store_error", "unknown", 1);
            }
            throw new ViewportStoreException("원격 cache 조회에 실패했습니다.", failure);
        } finally {
            metrics.time("store_get", started);

        }
    }

    @Override
    public void putMany(List<ViewportCell> cells, ViewportDeadline deadline) {
        deadline.requireRemaining();
        int originalSize = cells.size();
        validateBatch(originalSize);
        cells = cells.stream().filter(cell -> cell.items().size() <= properties.getMaxCellRows()
                && codec.encodedSize(cell) <= properties.getMaxValueBytes()).toList();
        metrics.count("store", "oversize_skipped", originalSize - cells.size());
        if (cells.isEmpty()) {
            return;
        }
        validateBatch(cells.size());
        if (cells.stream().mapToLong(ViewportCell::estimatedHeapBytes).sum() > properties.getMaxRequestBytes()) {
            metrics.count("store_error", "budget", 1);
            throw new ViewportStoreBudgetException("원격 cache 저장 batch 한도를 초과했습니다.");
        }
        List<ViewportCell> batch = List.copyOf(cells);
        ViewportDeadline transportDeadline = ViewportDeadline.after(properties.getCacheTimeout());
        execute(deadline, () -> {
            writeTransport(batch, transportDeadline);
            return null;
        }, true);
    }

    private void writeTransport(List<ViewportCell> cells, ViewportDeadline deadline) {
        StatefulRedisConnection<byte[], byte[]> active = null;
        long started = System.nanoTime();
        try {
            deadline.requireRemaining();
            byte[][] keys = new byte[cells.size()][];
            byte[][] arguments = new byte[cells.size() * 2][];
            for (int index = 0; index < cells.size(); index++) {
                ViewportCell cell = cells.get(index);
                keys[index] = text(cell.key().redisKey());
                arguments[index * 2] = codec.encode(cell);
                long base = (cell.items().isEmpty() ? properties.getEmptyTtl() : properties.getTtl()).toMillis();
                long ttl = Math.max(1, (long) (base * (1 + ThreadLocalRandom.current().nextDouble(-1, 1)
                        * properties.getTtlJitter())));
                arguments[index * 2 + 1] = text(ttl);
            }
            active = connection(deadline);
            deadline.requireRemaining();
            awaitCommand(active.async().eval(WRITE, ScriptOutputType.INTEGER, keys, arguments), deadline, active);
        } catch (ViewportUnavailableException failure) {
            metrics.count("store_error", Thread.currentThread().isInterrupted() ? "interrupted" : "operation_timeout", 1);
            throw new ViewportStoreException("원격 cache 저장 처리 예산을 초과했습니다.", failure);
        } catch (ViewportStoreBudgetException failure) {
            metrics.count("store_error", "budget", 1);
            throw failure;
        } catch (ViewportStoreException failure) {
            if (active != null && (!(failure instanceof CommandFailure) || !active.isOpen())) {
                failConnection(active);
            }
            throw failure;
        } catch (RuntimeException failure) {
            if (active != null && isCommandFailure(failure) && !hasConnectionFailure(active, failure)) {
                metrics.count("store_error", "command_error", 1);
            } else if (active != null) {
                metrics.count("store_error", hasConnectionFailure(active, failure) ? "connection_error" : "unknown", 1);
                failConnection(active);
            } else {
                metrics.count("store_error", "unknown", 1);
            }
            throw new ViewportStoreException("원격 cache 저장에 실패했습니다.", failure);
        } finally {
            metrics.time("store_put", started);

        }
    }

    private StatefulRedisConnection<byte[], byte[]> connection(ViewportDeadline deadline) {
        CompletableFuture<StatefulRedisConnection<byte[], byte[]>> attempt;
        synchronized (this) {
            if (closed || !closing.isDone() || circuitUntil != 0 && circuitUntil - System.nanoTime() > 0) {
                metrics.count("store_error", "circuit_open", 1);
                throw new ViewportStoreException("원격 cache 회로가 열려 있습니다.");
            }
            if (connection != null && connection.isOpen()) {
                return connection;
            }
            if (connection != null) {
                metrics.count("store_error", "connection_error", 1);
                failConnection(connection);
                throw new ViewportStoreException("종료된 원격 연결을 정리하고 있습니다.");
            }
            attempt = pendingConnect == null ? startConnect() : pendingConnect;
        }
        // This operation may stop waiting; only the connection attempt's own watchdog changes shared state.
        return awaitConnect(attempt, deadline);
    }

    private CompletableFuture<StatefulRedisConnection<byte[], byte[]>> startConnect() {
        CompletableFuture<StatefulRedisConnection<byte[], byte[]>> attempt = new CompletableFuture<>();
        CompletableFuture<StatefulRedisConnection<byte[], byte[]>> physical = new CompletableFuture<>();
        pendingConnect = attempt;
        var timeout = watchdog.schedule(() -> {
            synchronized (this) {
                if (pendingConnect == attempt) {
                    pendingConnect = null;
                    circuitUntil = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
                    closing = physical.handle((opened, ignored) -> opened == null
                            ? CompletableFuture.<Void>completedFuture(null) : opened.closeAsync())
                            .thenCompose(result -> result);
                    metrics.count("store_error", "connect_timeout", 1);
                    attempt.completeExceptionally(new ConnectTimeout());
                }
            }
        }, properties.getEffectiveRedisConnectTimeout().toNanos(), TimeUnit.NANOSECONDS);
        physical.whenComplete((opened, failure) -> {
            timeout.cancel(false);
            synchronized (this) {
                if (closed || pendingConnect != attempt) {
                    if (opened != null) {
                        opened.closeAsync();
                    }
                    attempt.completeExceptionally(new ViewportStoreException("이미 종료된 원격 연결 시도입니다."));
                    return;
                }
                pendingConnect = null;
                if (failure == null) {
                    connection = opened;
                    attempt.complete(opened);
                } else {
                    circuitUntil = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
                    attempt.completeExceptionally(failure);
                }
            }
        });
        try {
            connector.execute(() -> {
                try {
                    client.connectAsync(ByteArrayCodec.INSTANCE, uri).whenComplete((opened, failure) -> {
                        if (failure == null) {
                            physical.complete(opened);
                        } else {
                            physical.completeExceptionally(failure);
                        }
                    });
                } catch (Throwable failure) {
                    physical.completeExceptionally(failure);
                    if (failure instanceof Error fatal) {
                        throw fatal;
                    }
                }
            });
        } catch (RejectedExecutionException failure) {
            physical.completeExceptionally(failure);
        }
        return attempt;
    }

    private synchronized void failConnection(StatefulRedisConnection<byte[], byte[]> failed) {
        if (connection != failed) {
            return;
        }
        connection = null;
        circuitUntil = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        closing = failed.closeAsync();
    }

    private synchronized int pendingWork() {
        return pendingConnect != null || !closing.isDone() || connector.getActiveCount() != 0 ? 1 : 0;
    }

    private <T> T execute(ViewportDeadline callerDeadline, Callable<T> action, boolean awaitWriteCompletion) {
        callerDeadline.requireRemaining();
        CompletableFuture<T> result = new CompletableFuture<>();
        try {
            transport.execute(() -> {
                try {
                    result.complete(action.call());
                } catch (Throwable failure) {
                    result.completeExceptionally(failure);
                    if (failure instanceof Error fatal) {
                        throw fatal;
                    }
                }
            });
        } catch (RejectedExecutionException failure) {
            metrics.count("store_error", "transport_rejected", 1);
            throw new ViewportStoreException("원격 cache transport 한도를 초과했습니다.", failure);
        }
        try {
            // Only the independent bounded cache-writer calls putMany; its return owns flight cleanup.
            // HTTP reads retain their personal wait limit while transport remains independently bounded.
            T value = awaitWriteCompletion ? result.get()
                    : result.get(callerDeadline.remainingNanos(), TimeUnit.NANOSECONDS);
            if (!awaitWriteCompletion) {
                callerDeadline.requireRemaining();
            }
            return value;
        } catch (TimeoutException failure) {
            metrics.count("store_error", "caller_timeout", 1);
            throw new ViewportUnavailableException("개인 viewport cache 대기 시간을 초과했습니다.", failure);
        } catch (InterruptedException failure) {
            metrics.count("store_error", "interrupted", 1);
            Thread.currentThread().interrupt();
            throw new ViewportUnavailableException("개인 viewport cache 대기가 중단되었습니다.", failure);
        } catch (ExecutionException failure) {
            if (failure.getCause() instanceof RuntimeException runtime) {
                throw runtime;
            }
            throw new ViewportStoreException("원격 cache transport에 실패했습니다.", failure.getCause());
        }
        // A caller timeout never cancels transport: its bounded worker remains owned until terminal completion.
    }

    private <T> T awaitConnect(Future<T> future, ViewportDeadline deadline) {
        try {
            return future.get(deadline.remainingNanos(), TimeUnit.NANOSECONDS);
        } catch (TimeoutException failure) {
            metrics.count("store_error", "operation_timeout", 1);
            throw new ViewportStoreException("원격 cache transport deadline을 초과했습니다.", failure);
        } catch (InterruptedException failure) {
            metrics.count("store_error", "interrupted", 1);
            Thread.currentThread().interrupt();
            throw new ViewportStoreException("원격 cache transport가 중단되었습니다.", failure);
        } catch (ExecutionException failure) {
            if (!(failure.getCause() instanceof ConnectTimeout)) {
                metrics.count("store_error", failure.getCause() instanceof TimeoutException
                        ? "connect_timeout" : "connection_error", 1);
            }
            throw new ViewportStoreException("원격 cache 연결을 기다릴 수 없습니다.", failure.getCause());
        }
    }

    private static final class ConnectTimeout extends TimeoutException {
        private ConnectTimeout() {
            super("Redis connect budget expired");
        }
    }

    private <T> T awaitCommand(Future<T> future, ViewportDeadline deadline,
                               StatefulRedisConnection<byte[], byte[]> active) {
        try {
            return future.get(deadline.remainingNanos(), TimeUnit.NANOSECONDS);
        } catch (TimeoutException failure) {
            metrics.count("store_error", "operation_timeout", 1);
            throw new ViewportStoreException("원격 cache 명령 deadline을 초과했습니다.", failure);
        } catch (InterruptedException failure) {
            metrics.count("store_error", "interrupted", 1);
            Thread.currentThread().interrupt();
            throw new ViewportStoreException("원격 cache 명령 대기가 중단되었습니다.", failure);
        } catch (ExecutionException failure) {
            Throwable cause = failure.getCause();
            if (hasConnectionFailure(active, cause)) {
                metrics.count("store_error", "connection_error", 1);
            } else if (isCommandFailure(cause)) {
                metrics.count("store_error", "command_error", 1);
                throw new CommandFailure(cause);
            } else if (cause instanceof RedisCommandTimeoutException) {
                metrics.count("store_error", "operation_timeout", 1);
            } else {
                metrics.count("store_error", "unknown", 1);
            }
            throw new ViewportStoreException("원격 cache 명령에 실패했습니다.", cause);
        }
    }

    private static boolean isCommandFailure(Throwable failure) {
        return failure instanceof RedisCommandExecutionException;
    }

    private static boolean hasConnectionFailure(StatefulRedisConnection<byte[], byte[]> active, Throwable failure) {
        if (!active.isOpen()) {
            return true;
        }
        // Lettuce uses a plain RedisException for these exact disconnected/closed endpoint states.
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        for (Throwable cause = failure; cause != null && seen.add(cause); cause = cause.getCause()) {
            if (cause instanceof RedisConnectionException || cause instanceof IOException) {
                return true;
            }
            if (cause.getClass() == RedisException.class && ("Connection closed".equals(cause.getMessage())
                    || "Connection disconnected".equals(cause.getMessage())
                    || "Connection is closed".equals(cause.getMessage())
                    || "Currently not connected. Commands are rejected.".equals(cause.getMessage()))) {
                return true;
            }
        }
        return false;
    }

    private static final class CommandFailure extends ViewportStoreException {
        private CommandFailure(Throwable cause) {
            super("원격 cache 명령에 실패했습니다.", cause);
        }
    }

    private void validateBatch(int size) {
        if (size > properties.getMaxCells()) {
            metrics.count("store_error", "budget", 1);
            throw new ViewportStoreBudgetException("원격 cache key 한도를 초과했습니다.");
        }
    }

    private static byte[] text(Object value) {
        return value.toString().getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public void close() {
        StatefulRedisConnection<byte[], byte[]> owned;
        CompletableFuture<StatefulRedisConnection<byte[], byte[]>> connecting;
        synchronized (this) {
            if (closed) {
                return;
            }
            closed = true;
            owned = connection;
            connection = null;
            connecting = pendingConnect;
            pendingConnect = null;
        }
        List<Runnable> cleanup = List.of(
                () -> { if (connecting != null) connecting.whenComplete((opened, ignored) -> {
                    if (opened != null) {
                        opened.closeAsync();
                    }
                }); },
                () -> { if (owned != null) owned.closeAsync(); },
                () -> transport.shutdownNow(),
                () -> connector.shutdownNow(),
                () -> watchdog.shutdownNow(),
                () -> client.shutdown(Duration.ZERO, Duration.ofSeconds(1)),
                () -> resources.shutdown(0, 1, TimeUnit.SECONDS));
        Throwable failure = null;
        for (Runnable action : cleanup) {
            try {
                action.run();
            } catch (RuntimeException | Error cleanupFailure) {
                if (cleanupFailure instanceof Error && !(failure instanceof Error)) {
                    if (failure != null) {
                        cleanupFailure.addSuppressed(failure);
                    }
                    failure = cleanupFailure;
                } else if (failure == null) {
                    failure = cleanupFailure;
                } else if (failure != cleanupFailure) {
                    failure.addSuppressed(cleanupFailure);
                }
            }
        }
        if (failure instanceof Error fatal) {
            throw fatal;
        }
        if (failure instanceof RuntimeException runtime) {
            throw runtime;
        }
    }
}
