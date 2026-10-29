package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;

import io.lettuce.core.RedisClient;
import io.lettuce.core.RedisCommandInterruptedException;
import io.lettuce.core.RedisURI;
import io.lettuce.core.resource.ClientResources;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;
import jumin.config.ViewportCacheProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

class RedisViewportShutdownTest {

    @Test
    @DisplayName("client shutdown이 중단 예외를 던져도 owned event executor를 종료하고 interrupt를 보존한다")
    void cleans_owned_resources_after_client_shutdown_failure() {
        // given
        RedisClient client = mock(RedisClient.class);
        AtomicReference<ClientResources> owned = new AtomicReference<>();
        doAnswer(invocation -> {
            Thread.currentThread().interrupt();
            throw new RedisCommandInterruptedException(new InterruptedException("injected shutdown interrupt"));
        }).when(client).shutdown(Duration.ZERO, Duration.ofSeconds(1));
        try (MockedStatic<RedisClient> factory = mockStatic(RedisClient.class)) {
            factory.when(() -> RedisClient.create(any(ClientResources.class), any(RedisURI.class))).thenAnswer(invocation -> {
                owned.set(invocation.getArgument(0));
                return client;
            });
            ViewportCacheProperties properties = new ViewportCacheProperties();
            RedisViewportCellStore store = new RedisViewportCellStore(properties,
                    new ViewportCellCodec(properties.getMaxValueBytes(), properties.getMaxCellRows()),
                    new ViewportCellCover(new ViewportSquareGrid(), properties), new ViewportMetrics(new SimpleMeterRegistry()));

            // when & then
            try {
                assertThatThrownBy(store::close).isInstanceOf(RedisCommandInterruptedException.class);
                assertThat(owned.get().eventExecutorGroup().isShuttingDown()).isTrue();
                assertThat(Thread.currentThread().isInterrupted()).isTrue();
                store.close();
            } finally {
                Thread.interrupted();
                owned.get().shutdown();
            }
        }
    }
}
