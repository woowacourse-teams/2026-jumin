package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import io.lettuce.core.ConnectionFuture;
import io.lettuce.core.RedisClient;
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
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BiConsumer;
import jumin.config.ViewportCacheProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

class RedisViewportGenerationTest {

    @Test
    @SuppressWarnings("unchecked")
    @DisplayName("연결 복구 후 이전 세대의 늦은 실패가 새 연결의 circuit을 다시 열지 않는다")
    void stale_failure_cannot_poison_recovered_connection() throws Exception {
        // given
        RedisClient client = mock(RedisClient.class);
        StatefulRedisConnection<byte[], byte[]> oldConnection = mock(StatefulRedisConnection.class);
        StatefulRedisConnection<byte[], byte[]> newConnection = mock(StatefulRedisConnection.class);
        RedisAsyncCommands<byte[], byte[]> oldCommands = mock(RedisAsyncCommands.class);
        RedisAsyncCommands<byte[], byte[]> newCommands = mock(RedisAsyncCommands.class);
        for (var connection : List.of(oldConnection, newConnection)) {
            when(connection.isOpen()).thenReturn(true);
            when(connection.closeAsync()).thenReturn(CompletableFuture.completedFuture(null));
        }
        when(oldConnection.async()).thenReturn(oldCommands);
        when(newConnection.async()).thenReturn(newCommands);
        var firstConnection = opened(oldConnection);
        var secondConnection = opened(newConnection);
        when(client.connectAsync(any(RedisCodec.class), any(RedisURI.class)))
                .thenReturn(firstConnection, secondConnection);
        CountDownLatch oldPaused = new CountDownLatch(1);
        CountDownLatch releaseOld = new CountDownLatch(1);
        AtomicInteger calls = new AtomicInteger();
        RedisFuture<List<?>> success = mock(RedisFuture.class);
        when(success.get(anyLong(), eq(TimeUnit.NANOSECONDS))).thenReturn(Collections.singletonList(null));
        RedisFuture<List<?>> failed = mock(RedisFuture.class);
        when(failed.get(anyLong(), eq(TimeUnit.NANOSECONDS)))
                .thenThrow(new ExecutionException(new RedisConnectionException("closed old connection")));
        when(oldCommands.<List<?>>eval(anyString(), eq(ScriptOutputType.MULTI), any(byte[][].class), any(byte[][].class)))
                .thenAnswer(invocation -> {
                    int call = calls.incrementAndGet();
                    if (call == 2) {
                        oldPaused.countDown();
                        assertThat(releaseOld.await(10, TimeUnit.SECONDS)).isTrue();
                    }
                    return call == 1 ? success : failed;
                });
        when(newCommands.<List<?>>eval(anyString(), eq(ScriptOutputType.MULTI), any(byte[][].class), any(byte[][].class)))
                .thenReturn(success);
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setCacheTimeout(Duration.ofSeconds(1));
        ViewportCellKey key = new ViewportCellKey("generation", 1, 1, new ViewportVersion(UUID.randomUUID(), 1, 1000, true), 1);
        try (MockedStatic<RedisClient> factory = mockStatic(RedisClient.class);
             var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            factory.when(() -> RedisClient.create(any(ClientResources.class), any(RedisURI.class))).thenReturn(client);
            try (RedisViewportCellStore store = new RedisViewportCellStore(properties,
                    new ViewportCellCodec(properties.getMaxValueBytes(), properties.getMaxCellRows()),
                    new ViewportCellCover(new ViewportSquareGrid(), properties), new ViewportMetrics(new SimpleMeterRegistry()))) {
                assertThat(store.getMany(List.of(key), deadline())).isEmpty();
                var stale = CompletableFuture.supplyAsync(() -> store.getMany(List.of(key), deadline()), executor);
                assertThat(oldPaused.await(5, TimeUnit.SECONDS)).isTrue();
                assertThatThrownBy(() -> store.getMany(List.of(key), deadline())).isInstanceOf(ViewportStoreException.class);
                Thread.sleep(5100);
                assertThat(store.getMany(List.of(key), deadline())).isEmpty();

                // when
                releaseOld.countDown();
                assertThatThrownBy(() -> stale.get(3, TimeUnit.SECONDS)).hasCauseInstanceOf(ViewportStoreException.class);

                // then
                assertThat(store.getMany(List.of(key), deadline())).isEqualTo(Map.of());
            } finally {
                releaseOld.countDown();
            }
        }
    }

    @SuppressWarnings("unchecked")
    private static ConnectionFuture<StatefulRedisConnection<byte[], byte[]>> opened(StatefulRedisConnection<byte[], byte[]> connection) {
        ConnectionFuture<StatefulRedisConnection<byte[], byte[]>> future = mock(ConnectionFuture.class);
        when(future.whenComplete(any())).thenAnswer(invocation -> {
            BiConsumer<StatefulRedisConnection<byte[], byte[]>, Throwable> callback = invocation.getArgument(0);
            callback.accept(connection, null);
            return future;
        });
        return future;
    }

    private static ViewportDeadline deadline() {
        return ViewportDeadline.after(Duration.ofSeconds(10));
    }
}
