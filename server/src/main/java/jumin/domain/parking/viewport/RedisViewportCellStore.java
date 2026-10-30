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
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import jumin.config.ViewportCacheProperties;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;

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

    private record Lease(StatefulRedisConnection<byte[], byte[]> connection, long generation) { }

    private final ViewportCacheProperties properties;
    private final ViewportCellCodec codec;
    private final ViewportCellCover cover;
    private final ViewportMetrics metrics;
    private final DefaultClientResources resources;
    private final RedisClient client;
    private final RedisURI uri;
    private final Semaphore slots;
    private final ArrayDeque<Lease> idle = new ArrayDeque<>();
    private final Set<StatefulRedisConnection<byte[], byte[]>> connections = new HashSet<>();
    private long generation;
    private long circuitUntil;
    private boolean closed;

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
        slots = new Semaphore(properties.getMaxConcurrentRedis());
        metrics.registry().gauge("parking.viewport.redis.active", this,
                store -> properties.getMaxConcurrentRedis() - store.slots.availablePermits());
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
            throw new IllegalArgumentException("Redis URI 설정을 확인하세요. 인증정보는 별도로 지정해야 합니다.");
        }
        if (parsed.isSsl() && parsed.getVerifyMode() != SslVerifyMode.FULL) {
            throw new IllegalArgumentException("Redis TLS에는 인증서와 호스트 검증이 필요합니다.");
        }
        String username = properties.getRedisUsername();
        String password = properties.getRedisPassword();
        if (username == null && password == null) {
            return parsed;
        }
        if (username == null || username.isBlank() || password == null || password.isBlank()) {
            throw new IllegalArgumentException("Redis 사용자 이름과 비밀번호를 함께 설정하세요.");
        }
        parsed.setAuthentication(username, password);
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
            return SslOptions.builder().jdkSslProvider().trustManager(path.toFile()).build();
        } catch (IOException | CertificateException | RuntimeException invalid) {
            throw new IllegalArgumentException("Redis TLS 인증서 파일을 읽을 수 없습니다.");
        }
    }

    private ViewportDeadline cacheDeadline(ViewportDeadline caller) {
        caller.requireRemaining();
        return new ViewportDeadline(System.nanoTime()
                + Math.min(caller.remainingNanos(), properties.getCacheTimeout().toNanos()));
    }

    @Override
    public Map<ViewportCellKey, ViewportCell> getMany(List<ViewportCellKey> keys, ViewportDeadline caller) {
        caller.requireRemaining();
        if (keys.isEmpty()) {
            return Map.of();
        }
        validateBatch(keys.size());
        ViewportDeadline deadline = cacheDeadline(caller);
        Lease lease = null;
        long started = System.nanoTime();
        try {
            lease = borrow(deadline);
            byte[][] encodedKeys = keys.stream().map(key -> text(key.redisKey())).toArray(byte[][]::new);
            deadline.requireRemaining();
            List<?> values = lease.connection().sync().eval(READ, ScriptOutputType.MULTI, encodedKeys,
                    text(properties.getMaxValueBytes()), text(properties.getMaxRequestBytes()), text(properties.getMaxCells()));
            return decodeValues(keys, values, deadline);
        } catch (RuntimeException failure) {
            throw storeFailure(lease, caller, failure);
        } finally {
            release(lease);
            metrics.time("store_get", started);
        }
    }

    @Override
    public void putMany(List<ViewportCell> cells, ViewportDeadline caller) {
        caller.requireRemaining();
        validateBatch(cells.size());
        List<ViewportCell> cacheable = cells.stream().filter(this::isCacheable).toList();
        metrics.count("store", "oversize_skipped", cells.size() - cacheable.size());
        if (cacheable.isEmpty()) {
            return;
        }
        if (cacheable.stream().mapToLong(ViewportCell::estimatedHeapBytes).sum() > properties.getMaxRequestBytes()) {
            metrics.count("store_error", "budget", 1);
            throw new ViewportStoreBudgetException("원격 cache 저장 batch 한도를 초과했습니다.");
        }
        ViewportDeadline deadline = cacheDeadline(caller);
        Lease lease = null;
        long started = System.nanoTime();
        try {
            WriteBatch batch = encodeBatch(cacheable);
            deadline.requireRemaining();
            lease = borrow(deadline);
            deadline.requireRemaining();
            lease.connection().sync().eval(WRITE, ScriptOutputType.INTEGER, batch.keys(), batch.arguments());
        } catch (RuntimeException failure) {
            throw storeFailure(lease, caller, failure);
        } finally {
            release(lease);
            metrics.time("store_put", started);
        }
    }

    private Lease borrow(ViewportDeadline deadline) {
        if (!slots.tryAcquire()) {
            metrics.count("store_error", "transport_rejected", 1);
            throw new ViewportStoreException("원격 cache 동시 조회 한도를 초과했습니다.");
        }
        StatefulRedisConnection<byte[], byte[]> opened = null;
        long version = -1;
        try {
            synchronized (this) {
                requireAvailable();
                while (!idle.isEmpty()) {
                    Lease existing = idle.removeFirst();
                    if (existing.generation() == generation && existing.connection().isOpen()) {
                        existing.connection().setTimeout(Duration.ofNanos(Math.max(1, deadline.remainingNanos())));
                        return existing;
                    }
                    connections.remove(existing.connection());
                    existing.connection().close();
                }
                version = generation;
            }
            opened = client.connect(ByteArrayCodec.INSTANCE, uri);
            synchronized (this) {
                requireAvailable();
                if (generation != version) {
                    throw new ViewportStoreException("원격 cache 연결이 교체되었습니다.");
                }
                deadline.requireRemaining();
                opened.setTimeout(Duration.ofNanos(Math.max(1, deadline.remainingNanos())));
                connections.add(opened);
                return new Lease(opened, version);
            }
        } catch (RuntimeException | Error failure) {
            try {
                if (opened != null) {
                    opened.close();
                }
            } catch (RuntimeException closeFailure) {
                failure.addSuppressed(closeFailure);
            } finally {
                slots.release();
            }
            if (failure instanceof RedisException) {
                synchronized (this) {
                    if (!closed && version == generation) {
                        openCircuit();
                    }
                }
                metrics.count("store_error", failure instanceof RedisCommandTimeoutException
                        ? "connect_timeout" : "connection_error", 1);
                throw new ViewportStoreException("원격 cache 연결에 실패했습니다.", failure);
            }
            throw failure;
        }
    }

    private synchronized void requireAvailable() {
        if (closed || circuitUntil - System.nanoTime() > 0) {
            metrics.count("store_error", "circuit_open", 1);
            throw new ViewportStoreException("원격 cache 회로가 열려 있습니다.");
        }
    }

    private synchronized void openCircuit() {
        generation++;
        circuitUntil = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
    }

    private void release(Lease lease) {
        if (lease == null) {
            return;
        }
        boolean reusable;
        synchronized (this) {
            reusable = !closed && lease.generation() == generation
                    && connections.contains(lease.connection()) && lease.connection().isOpen();
            if (reusable) {
                idle.addLast(lease);
            } else {
                connections.remove(lease.connection());
            }
        }
        try {
            if (!reusable) {
                lease.connection().close();
            }
        } catch (RuntimeException closeFailure) {
            metrics.count("store_error", "close_failure", 1);
        } finally {
            slots.release();
        }
    }

    private RuntimeException storeFailure(Lease lease, ViewportDeadline caller, RuntimeException failure) {
        if (failure instanceof ViewportStoreBudgetException) {
            metrics.count("store_error", "budget", 1);
            return failure;
        }
        if (failure instanceof BusinessException business && business.getErrorCode() == ErrorCode.VIEWPORT_UNAVAILABLE) {
            return caller.remainingNanos() == 0 ? business
                    : new ViewportStoreException("원격 cache 처리 예산을 초과했습니다.", business);
        }
        if (failure instanceof ViewportStoreException) {
            return failure;
        }
        if (lease != null && isCommandFailure(failure) && !hasConnectionFailure(lease.connection(), failure)) {
            metrics.count("store_error", "command_error", 1);
            return new ViewportStoreException("원격 cache 명령에 실패했습니다.", failure);
        }
        boolean callerExpired = caller.remainingNanos() == 0;
        if (lease != null) {
            synchronized (this) {
                connections.remove(lease.connection());
                if (!callerExpired && lease.generation() == generation) {
                    openCircuit();
                }
            }
        }
        if (failure instanceof RedisCommandTimeoutException) {
            metrics.count("store_error", callerExpired ? "caller_timeout" : "operation_timeout", 1);
        } else {
            metrics.count("store_error", "connection_error", 1);
        }
        return callerExpired ? ViewportFailureReason.UNCLASSIFIED.failure(failure)
                : new ViewportStoreException("원격 cache 명령에 실패했습니다.", failure);
    }

    private Map<ViewportCellKey, ViewportCell> decodeValues(List<ViewportCellKey> keys, List<?> values,
                                                           ViewportDeadline deadline) {
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
                ViewportCell cell = decodeCell(key, (byte[]) values.get(index),
                        properties.getMaxRequestBytes() - heap, deadline);
                heap += cell.estimatedHeapBytes();
                result.put(key, cell);
            } catch (IllegalArgumentException failure) {
                metrics.count("store", "corrupt", 1);
            }
        }
        deadline.requireRemaining();
        return Map.copyOf(result);
    }

    private ViewportCell decodeCell(ViewportCellKey key, byte[] value, long remainingBytes,
                                    ViewportDeadline deadline) {
        ViewportCell cell = codec.decode(key, value, remainingBytes);
        for (ViewportItem item : cell.items()) {
            deadline.requireRemaining();
            if (!cover.belongsTo(item, key)) {
                throw new IllegalArgumentException("다른 셀의 항목입니다.");
            }
        }
        return cell;
    }

    private boolean isCacheable(ViewportCell cell) {
        return cell.items().size() <= properties.getMaxCellRows()
                && codec.encodedSize(cell) <= properties.getMaxValueBytes();
    }

    private WriteBatch encodeBatch(List<ViewportCell> cells) {
        byte[][] keys = new byte[cells.size()][];
        byte[][] arguments = new byte[cells.size() * 2][];
        for (int index = 0; index < cells.size(); index++) {
            ViewportCell cell = cells.get(index);
            keys[index] = text(cell.key().redisKey());
            arguments[index * 2] = codec.encode(cell);
            long base;
            if (cell.items().isEmpty()) {
                base = properties.getEmptyTtl().toMillis();
            } else {
                base = properties.getTtl().toMillis();
            }
            long ttl = Math.max(1, (long) (base * (1 + ThreadLocalRandom.current().nextDouble(-1, 1)
                    * properties.getTtlJitter())));
            arguments[index * 2 + 1] = text(ttl);
        }
        return new WriteBatch(keys, arguments);
    }

    private record WriteBatch(byte[][] keys, byte[][] arguments) { }

    private static boolean isCommandFailure(Throwable failure) {
        return failure instanceof RedisCommandExecutionException;
    }

    private static boolean hasConnectionFailure(StatefulRedisConnection<byte[], byte[]> active, Throwable failure) {
        if (!active.isOpen()) {
            return true;
        }
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        for (Throwable cause = failure; cause != null && seen.add(cause); cause = cause.getCause()) {
            if (cause instanceof RedisConnectionException || cause instanceof IOException) {
                return true;
            }
            if (isDisconnectedRedisException(cause)) {
                return true;
            }
        }
        return false;
    }

    private static boolean isDisconnectedRedisException(Throwable failure) {
        return failure.getClass() == RedisException.class && ("Connection closed".equals(failure.getMessage())
                || "Connection disconnected".equals(failure.getMessage())
                || "Connection is closed".equals(failure.getMessage())
                || "Currently not connected. Commands are rejected.".equals(failure.getMessage()));
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
        List<StatefulRedisConnection<byte[], byte[]>> owned;
        synchronized (this) {
            if (closed) {
                return;
            }
            closed = true;
            generation++;
            owned = List.copyOf(connections);
            connections.clear();
            idle.clear();
        }
        List<Runnable> cleanup = new ArrayList<>();
        owned.forEach(connection -> cleanup.add(connection::close));
        cleanup.add(() -> client.shutdown(Duration.ZERO, Duration.ofSeconds(1)));
        cleanup.add(() -> resources.shutdown(0, 1, TimeUnit.SECONDS).syncUninterruptibly());
        Throwable failure = runCleanup(cleanup);
        if (failure instanceof Error fatal) {
            throw fatal;
        }
        if (failure instanceof RuntimeException runtime) {
            throw runtime;
        }
    }

    private static Throwable runCleanup(List<Runnable> cleanup) {
        Throwable failure = null;
        for (Runnable action : cleanup) {
            try {
                action.run();
            } catch (RuntimeException | Error cleanupFailure) {
                failure = mergeCleanupFailure(failure, cleanupFailure);
            }
        }
        return failure;
    }

    private static Throwable mergeCleanupFailure(Throwable failure, Throwable cleanupFailure) {
        if (cleanupFailure instanceof Error && !(failure instanceof Error)) {
            if (failure != null) {
                cleanupFailure.addSuppressed(failure);
            }
            return cleanupFailure;
        }
        if (failure == null) {
            return cleanupFailure;
        }
        if (failure != cleanupFailure) {
            failure.addSuppressed(cleanupFailure);
        }
        return failure;
    }
}
