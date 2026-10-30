package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import io.lettuce.core.RedisClient;
import io.lettuce.core.RedisConnectionException;
import io.lettuce.core.RedisURI;
import io.lettuce.core.ScriptOutputType;
import io.lettuce.core.api.StatefulRedisConnection;
import io.lettuce.core.api.sync.RedisCommands;
import io.lettuce.core.codec.RedisCodec;
import io.lettuce.core.resource.ClientResources;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import jumin.config.ViewportCacheProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

class RedisViewportGenerationTest {

    @Test
    @SuppressWarnings("unchecked")
    @DisplayName("이전 연결의 늦은 실패는 복구된 새 연결의 회로를 다시 열지 않는다")
    void stale_failure_cannot_poison_recovered_connection() throws Exception {
        // given
        RedisClient client = mock(RedisClient.class);
        StatefulRedisConnection<byte[], byte[]> slow = mock(StatefulRedisConnection.class);
        StatefulRedisConnection<byte[], byte[]> failed = mock(StatefulRedisConnection.class);
        StatefulRedisConnection<byte[], byte[]> recovered = mock(StatefulRedisConnection.class);
        RedisCommands<byte[], byte[]> slowCommands = mock(RedisCommands.class);
        RedisCommands<byte[], byte[]> failedCommands = mock(RedisCommands.class);
        RedisCommands<byte[], byte[]> recoveredCommands = mock(RedisCommands.class);
        for (var connection : List.of(slow, failed, recovered)) {
            when(connection.isOpen()).thenReturn(true);
        }
        when(slow.sync()).thenReturn(slowCommands);
        when(failed.sync()).thenReturn(failedCommands);
        when(recovered.sync()).thenReturn(recoveredCommands);
        when(client.connect(any(RedisCodec.class), any(RedisURI.class))).thenReturn(slow, failed, recovered);
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(slowCommands.eval(anyString(), eq(ScriptOutputType.MULTI), any(byte[][].class), any(byte[][].class)))
                .thenAnswer(invocation -> {
                    started.countDown();
                    assertThat(release.await(10, TimeUnit.SECONDS)).isTrue();
                    throw new RedisConnectionException("old connection failed");
                });
        when(failedCommands.eval(anyString(), eq(ScriptOutputType.MULTI), any(byte[][].class), any(byte[][].class)))
                .thenThrow(new RedisConnectionException("connection failed"));
        when(recoveredCommands.eval(anyString(), eq(ScriptOutputType.MULTI), any(byte[][].class), any(byte[][].class)))
                .thenReturn(Collections.singletonList(null));
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setCacheTimeout(Duration.ofSeconds(20));
        ViewportCellKey key = new ViewportCellKey("generation", 1, 1, 1000, 1);
        try (MockedStatic<RedisClient> factory = mockStatic(RedisClient.class);
             var threads = Executors.newVirtualThreadPerTaskExecutor()) {
            factory.when(() -> RedisClient.create(any(ClientResources.class), any(RedisURI.class))).thenReturn(client);
            try (var store = new RedisViewportCellStore(properties,
                    new ViewportCellCodec(properties.getMaxValueBytes(), properties.getMaxCellRows()),
                    new ViewportCellCover(new ViewportSquareGrid(), properties), new ViewportMetrics(new SimpleMeterRegistry()))) {
                // when
                var old = CompletableFuture.supplyAsync(() -> store.getMany(List.of(key), deadline()), threads);
                assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
                assertThatThrownBy(() -> store.getMany(List.of(key), deadline())).isInstanceOf(ViewportStoreException.class);
                Thread.sleep(5100);
                assertThat(store.getMany(List.of(key), deadline())).isEmpty();
                release.countDown();
                // then
                assertThatThrownBy(() -> old.get(3, TimeUnit.SECONDS)).hasCauseInstanceOf(ViewportStoreException.class);
                assertThat(store.getMany(List.of(key), deadline())).isEmpty();
            } finally {
                release.countDown();
            }
        }
    }

    private static ViewportDeadline deadline() {
        return ViewportDeadline.after(Duration.ofSeconds(20));
    }
}
