package jumin.domain.parking.cache;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.never;

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
import jumin.domain.parking.exception.ViewportStoreException;
import jumin.domain.parking.model.ViewportCellKey;
import jumin.domain.parking.model.ViewportDeadline;
import jumin.domain.parking.monitoring.ViewportMetrics;
import jumin.domain.parking.service.ViewportCellCover;
import jumin.domain.parking.service.ViewportSquareGrid;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

class RedisViewportReconnectTest {

    @Test
    @SuppressWarnings("unchecked")
    @DisplayName("한 요청의 늦은 실패가 공유 연결의 다른 요청과 후속 조회를 중단하지 않는다")
    void late_failure_does_not_close_shared_connection() throws Exception {
        // given
        RedisClient client = mock(RedisClient.class);
        StatefulRedisConnection<byte[], byte[]> connection = mock(StatefulRedisConnection.class);
        RedisCommands<byte[], byte[]> commands = mock(RedisCommands.class);
        when(connection.sync()).thenReturn(commands);
        when(client.connect(any(RedisCodec.class), any(RedisURI.class))).thenReturn(connection);
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(commands.eval(anyString(), eq(ScriptOutputType.MULTI), any(byte[][].class), any(byte[][].class)))
                .thenAnswer(invocation -> {
                    started.countDown();
                    assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
                    throw new RedisConnectionException("late request failure");
                }).thenReturn(Collections.singletonList(null));
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setCacheTimeout(Duration.ofSeconds(10));
        ViewportCellKey key = new ViewportCellKey("reconnect", 1, 1, 1000, 1);
        try (MockedStatic<RedisClient> factory = mockStatic(RedisClient.class);
             var threads = Executors.newVirtualThreadPerTaskExecutor()) {
            factory.when(() -> RedisClient.create(any(ClientResources.class), any(RedisURI.class))).thenReturn(client);
            try (var store = new RedisViewportCellStore(properties,
                    new ViewportCellCodec(properties.getMaxValueBytes(), properties.getMaxCellRows()),
                    new ViewportCellCover(new ViewportSquareGrid(), properties), new ViewportMetrics(new SimpleMeterRegistry()))) {
                // when
                var first = CompletableFuture.supplyAsync(() -> store.getMany(List.of(key), deadline()), threads);
                assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
                assertThat(store.getMany(List.of(key), deadline())).isEmpty();
                release.countDown();
                // then
                assertThatThrownBy(() -> first.get(3, TimeUnit.SECONDS)).hasCauseInstanceOf(ViewportStoreException.class);
                assertThat(store.getMany(List.of(key), deadline())).isEmpty();
                verify(client, times(1)).connect(any(RedisCodec.class), any(RedisURI.class));
                verify(connection, never()).close();
            } finally {
                release.countDown();
            }
        }
    }

    private static ViewportDeadline deadline() {
        return ViewportDeadline.after(Duration.ofSeconds(20));
    }
}
