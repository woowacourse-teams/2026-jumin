package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.lettuce.core.ConnectionFuture;
import io.lettuce.core.RedisClient;
import io.lettuce.core.RedisCommandExecutionException;
import io.lettuce.core.RedisConnectionException;
import io.lettuce.core.RedisFuture;
import io.lettuce.core.RedisURI;
import io.lettuce.core.ScriptOutputType;
import io.lettuce.core.api.StatefulRedisConnection;
import io.lettuce.core.api.async.RedisAsyncCommands;
import io.lettuce.core.codec.RedisCodec;
import io.lettuce.core.resource.ClientResources;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.BiConsumer;
import jumin.config.ViewportCacheProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

@SuppressWarnings("unchecked")
class RedisViewportFailureTest {

    @Test
    @DisplayName("DB 상한과 무관하게 Redis 동시성 한도만큼 실행하고 초과 요청을 거절한다")
    void redis_transport_is_independent_of_db_capacity() throws Exception {
        ViewportCacheProperties properties = properties();
        properties.setMaxConcurrentDb(1);
        properties.setRedisTransportThreads(2);
        CountDownLatch submitted = new CountDownLatch(2);
        FakeRedisFuture<List<?>> pending = new FakeRedisFuture<>();
        try (Fixture fixture = new Fixture(properties); var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            when(fixture.commands.<List<?>>eval(anyString(), eq(ScriptOutputType.MULTI),
                    any(byte[][].class), any(byte[][].class))).thenAnswer(invocation -> {
                        submitted.countDown();
                        return pending;
                    });
            var first = CompletableFuture.supplyAsync(() -> fixture.store.getMany(List.of(key(1)), deadline()), executor);
            var second = CompletableFuture.supplyAsync(() -> fixture.store.getMany(List.of(key(2)), deadline()), executor);
            try {
                assertThat(submitted.await(5, TimeUnit.SECONDS)).isTrue();
                assertThatThrownBy(() -> fixture.store.getMany(List.of(key(3)), deadline()))
                        .isInstanceOf(ViewportStoreException.class).hasMessageContaining("transport");
                assertThat(fixture.count("transport_rejected")).isEqualTo(1);
                assertThat(fixture.count("circuit_open")).isZero();
                verify(fixture.connection, never()).closeAsync();
            } finally {
                pending.complete(Collections.singletonList(null));
            }
            assertThat(first.get(5, TimeUnit.SECONDS)).isEmpty();
            assertThat(second.get(5, TimeUnit.SECONDS)).isEmpty();
        }
    }

    @Test
    @DisplayName("읽기와 쓰기의 정상 프로토콜 명령 오류는 연결을 닫거나 회로를 열지 않는다")
    void command_errors_reuse_the_same_connection() {
        try (Fixture fixture = new Fixture(properties())) {
            FakeRedisFuture<List<?>> failedRead = failed(new RedisCommandExecutionException("read failed"));
            FakeRedisFuture<List<?>> successfulRead = completed(Collections.singletonList(null));
            FakeRedisFuture<Long> failedWrite = failed(new RedisCommandExecutionException("write failed"));
            FakeRedisFuture<Long> successfulWrite = completed(1L);
            when(fixture.commands.<List<?>>eval(anyString(), eq(ScriptOutputType.MULTI),
                    any(byte[][].class), any(byte[][].class))).thenReturn(failedRead, successfulRead);
            when(fixture.commands.<Long>eval(anyString(), eq(ScriptOutputType.INTEGER),
                    any(byte[][].class), any(byte[][].class))).thenReturn(failedWrite, successfulWrite);
            ViewportCell cell = new ViewportCell(key(1), List.of());

            assertThatThrownBy(() -> fixture.store.getMany(List.of(cell.key()), deadline()))
                    .isInstanceOf(ViewportStoreException.class);
            assertThat(fixture.store.getMany(List.of(cell.key()), deadline())).isEmpty();
            assertThatThrownBy(() -> fixture.store.putMany(List.of(cell), deadline()))
                    .isInstanceOf(ViewportStoreException.class);
            fixture.store.putMany(List.of(cell), deadline());

            assertThat(fixture.count("command_error")).isEqualTo(2);
            assertThat(fixture.count("connection_error")).isZero();
            assertThat(fixture.count("circuit_open")).isZero();
            verify(fixture.client, times(1)).connectAsync(any(RedisCodec.class), any(RedisURI.class));
            verify(fixture.connection, never()).closeAsync();
        }
    }

    @Test
    @DisplayName("연결 장애는 세대 연결을 닫고 후속 요청을 circuit에서 거절한다")
    void connection_failure_is_fenced_and_classified() {
        try (Fixture fixture = new Fixture(properties())) {
            FakeRedisFuture<List<?>> failure = failed(new RedisConnectionException("closed"));
            when(fixture.commands.<List<?>>eval(anyString(), eq(ScriptOutputType.MULTI),
                    any(byte[][].class), any(byte[][].class))).thenReturn(failure);

            assertThatThrownBy(() -> fixture.store.getMany(List.of(key(1)), deadline()))
                    .isInstanceOf(ViewportStoreException.class);
            assertThatThrownBy(() -> fixture.store.getMany(List.of(key(1)), deadline()))
                    .isInstanceOf(ViewportStoreException.class).hasMessageContaining("회로");
            assertThat(fixture.count("connection_error")).isEqualTo(1);
            assertThat(fixture.count("circuit_open")).isEqualTo(1);
            verify(fixture.connection, times(1)).closeAsync();
        }
    }

    @Test
    @DisplayName("명령 timeout은 미완료 명령을 남기지 않도록 기존 연결을 종료한다")
    void operation_timeout_preserves_connection_fencing() {
        ViewportCacheProperties properties = properties();
        FakeRedisFuture<List<?>> pending = new FakeRedisFuture<>();
        try (Fixture fixture = new Fixture(properties)) {
            when(fixture.commands.<List<?>>eval(anyString(), eq(ScriptOutputType.MULTI),
                    any(byte[][].class), any(byte[][].class)))
                    .thenReturn(completed(Collections.singletonList(null)), pending);
            when(fixture.connection.closeAsync()).thenAnswer(invocation -> {
                pending.completeExceptionally(new RedisConnectionException("closed"));
                return CompletableFuture.completedFuture(null);
            });

            assertThat(fixture.store.getMany(List.of(key(1)), deadline())).isEmpty();
            properties.setCacheTimeout(Duration.ofMillis(50));
            assertThatThrownBy(() -> fixture.store.getMany(List.of(key(1)), deadline()))
                    .isInstanceOf(ViewportStoreException.class);
            assertThat(fixture.count("operation_timeout")).isEqualTo(1);
            assertThat(pending).isCompletedExceptionally();
            verify(fixture.connection, times(1)).closeAsync();
        }
    }

    @Test
    @DisplayName("연결 watchdog timeout과 이후 열린 회로를 별도로 집계한다")
    void classifies_connect_timeout_and_open_circuit() {
        ViewportCacheProperties properties = properties();
        properties.setRedisConnectTimeout(Duration.ofMillis(50));
        try (Fixture fixture = new Fixture(properties)) {
            ConnectionFuture<StatefulRedisConnection<byte[], byte[]>> neverOpens = mock(ConnectionFuture.class);
            when(neverOpens.whenComplete(any())).thenReturn(neverOpens);
            when(fixture.client.connectAsync(any(RedisCodec.class), any(RedisURI.class))).thenReturn(neverOpens);

            assertThatThrownBy(() -> fixture.store.getMany(List.of(key(1)), deadline()))
                    .isInstanceOf(ViewportStoreException.class);
            assertThatThrownBy(() -> fixture.store.getMany(List.of(key(1)), deadline()))
                    .isInstanceOf(ViewportStoreException.class).hasMessageContaining("회로");
            assertThat(fixture.count("connect_timeout")).isEqualTo(1);
            assertThat(fixture.count("circuit_open")).isEqualTo(1);
            verify(fixture.client, times(1)).connectAsync(any(RedisCodec.class), any(RedisURI.class));
        }
    }

    @Test
    @DisplayName("호출자가 먼저 시간 초과해도 미완료 연결 시도의 watchdog을 한 번 집계한다")
    void counts_connect_watchdog_without_an_active_waiter() throws Exception {
        ViewportCacheProperties properties = properties();
        properties.setCacheTimeout(Duration.ofMillis(200));
        properties.setRedisConnectTimeout(Duration.ofMillis(500));
        CountDownLatch connecting = new CountDownLatch(1);
        try (Fixture fixture = new Fixture(properties)) {
            ConnectionFuture<StatefulRedisConnection<byte[], byte[]>> neverOpens = mock(ConnectionFuture.class);
            when(neverOpens.whenComplete(any())).thenReturn(neverOpens);
            when(fixture.client.connectAsync(any(RedisCodec.class), any(RedisURI.class))).thenAnswer(invocation -> {
                connecting.countDown();
                return neverOpens;
            });

            assertThatThrownBy(() -> fixture.store.getMany(List.of(key(1)), deadline()))
                    .isInstanceOf(ViewportStoreException.class);
            assertThat(connecting.await(5, TimeUnit.SECONDS)).isTrue();
            long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
            while (fixture.count("connect_timeout") == 0 && System.nanoTime() < until) {
                Thread.sleep(2);
            }
            assertThat(fixture.count("operation_timeout")).isEqualTo(1);
            assertThat(fixture.count("connect_timeout")).isEqualTo(1);
        }
    }

    @Test
    @DisplayName("key와 저장 batch 예산 초과는 일시 연결 장애와 구별한다")
    void key_and_write_budgets_are_typed_and_counted() {
        ViewportCacheProperties properties = properties();
        properties.setMaxCells(1);
        properties.setMaxValueBytes(256);
        properties.setMaxRequestBytes(320);
        try (Fixture fixture = new Fixture(properties)) {
            ViewportCell oneItem = new ViewportCell(key(1), List.of(
                    new ViewportItem(1, 37.5, 127, 50, false, true, false, false, false)));
            assertThatThrownBy(() -> fixture.store.getMany(List.of(key(1), key(2)), deadline()))
                    .isInstanceOf(ViewportStoreBudgetException.class);
            assertThatThrownBy(() -> fixture.store.putMany(List.of(oneItem), deadline()))
                    .isInstanceOf(ViewportStoreBudgetException.class);
            assertThat(fixture.count("budget")).isEqualTo(2);
            verify(fixture.client, never()).connectAsync(any(RedisCodec.class), any(RedisURI.class));
        }
    }

    @Test
    @DisplayName("wire와 decoded 예산 초과는 연결을 보존하며 별도 예산 실패로 기록한다")
    void wire_and_decoded_budgets_keep_the_connection() {
        ViewportCacheProperties properties = properties();
        properties.setMaxCellRows(1);
        ViewportCellKey key = key(1);
        ViewportCell larger = new ViewportCell(key, List.of(
                new ViewportItem(1, 37.5, 127, 50, false, true, false, false, false),
                new ViewportItem(2, 37.5, 127, 50, false, true, false, false, false)));
        byte[] encoded = new ViewportCellCodec(properties.getMaxValueBytes(), 2).encode(larger);
        try (Fixture fixture = new Fixture(properties)) {
            when(fixture.commands.<List<?>>eval(anyString(), eq(ScriptOutputType.MULTI),
                    any(byte[][].class), any(byte[][].class)))
                    .thenReturn(completed(List.of(-1L)), completed(Collections.singletonList(encoded)),
                            completed(Collections.singletonList(null)));

            assertThatThrownBy(() -> fixture.store.getMany(List.of(key), deadline()))
                    .isInstanceOf(ViewportStoreBudgetException.class);
            assertThatThrownBy(() -> fixture.store.getMany(List.of(key), deadline()))
                    .isInstanceOf(ViewportStoreBudgetException.class);
            assertThat(fixture.store.getMany(List.of(key), deadline())).isEmpty();
            assertThat(fixture.count("budget")).isEqualTo(2);
            assertThat(fixture.count("command_error")).isZero();
            verify(fixture.connection, never()).closeAsync();
        }
    }

    private static ViewportCacheProperties properties() {
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setCacheTimeout(Duration.ofSeconds(2));
        properties.setMaxRequestBytes(1024 * 1024);
        properties.setRedisTransportThreads(8);
        return properties;
    }

    private static ViewportCellKey key(long id) {
        return new ViewportCellKey("redis-test", 1, 1,
                new ViewportVersion(new UUID(0, 1), 1, 1000, true), id);
    }

    private static ViewportDeadline deadline() {
        return ViewportDeadline.after(Duration.ofSeconds(5));
    }

    private static <T> FakeRedisFuture<T> completed(T value) {
        FakeRedisFuture<T> future = new FakeRedisFuture<>();
        future.complete(value);
        return future;
    }

    private static <T> FakeRedisFuture<T> failed(Throwable failure) {
        FakeRedisFuture<T> future = new FakeRedisFuture<>();
        future.completeExceptionally(failure);
        return future;
    }

    private static final class FakeRedisFuture<T> extends CompletableFuture<T> implements RedisFuture<T> {
        @Override
        public String getError() {
            return null;
        }

        @Override
        public boolean await(long timeout, TimeUnit unit) throws InterruptedException {
            try {
                get(timeout, unit);
                return true;
            } catch (ExecutionException failure) {
                return true;
            } catch (TimeoutException failure) {
                return false;
            }
        }
    }

    private static final class Fixture implements AutoCloseable {
        private final RedisClient client = mock(RedisClient.class);
        private final StatefulRedisConnection<byte[], byte[]> connection = mock(StatefulRedisConnection.class);
        private final RedisAsyncCommands<byte[], byte[]> commands = mock(RedisAsyncCommands.class);
        private final ViewportMetrics metrics = new ViewportMetrics(new SimpleMeterRegistry());
        private final MockedStatic<RedisClient> factory;
        private final RedisViewportCellStore store;

        private Fixture(ViewportCacheProperties properties) {
            when(connection.isOpen()).thenReturn(true);
            when(connection.async()).thenReturn(commands);
            when(connection.closeAsync()).thenReturn(CompletableFuture.completedFuture(null));
            ConnectionFuture<StatefulRedisConnection<byte[], byte[]>> opened = mock(ConnectionFuture.class);
            when(opened.whenComplete(any())).thenAnswer(invocation -> {
                BiConsumer<StatefulRedisConnection<byte[], byte[]>, Throwable> callback = invocation.getArgument(0);
                callback.accept(connection, null);
                return opened;
            });
            when(client.connectAsync(any(RedisCodec.class), any(RedisURI.class))).thenReturn(opened);
            factory = mockStatic(RedisClient.class);
            factory.when(() -> RedisClient.create(any(ClientResources.class), any(RedisURI.class))).thenReturn(client);
            store = new RedisViewportCellStore(properties,
                    new ViewportCellCodec(properties.getMaxValueBytes(), properties.getMaxCellRows()),
                    new ViewportCellCover(new ViewportSquareGrid(), properties), metrics);
        }

        private double count(String outcome) {
            return metrics.registry().counter("parking.viewport.store_error", "outcome", outcome).count();
        }

        @Override
        public void close() {
            try {
                store.close();
            } finally {
                factory.close();
            }
        }
    }
}
