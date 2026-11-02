package jumin.domain.parking.cache;

import static jumin.config.ViewportCacheProperties.MAX_CELLS;
import static jumin.config.ViewportCacheProperties.MAX_CELL_ROWS;
import static jumin.config.ViewportCacheProperties.MAX_VALUE_BYTES;
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

import io.lettuce.core.RedisClient;
import io.lettuce.core.RedisCommandExecutionException;
import io.lettuce.core.RedisCommandTimeoutException;
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
import java.util.stream.LongStream;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.exception.ViewportStoreBudgetException;
import jumin.domain.parking.exception.ViewportStoreException;
import jumin.domain.parking.model.ViewportCell;
import jumin.domain.parking.model.ViewportCellKey;
import jumin.domain.parking.model.ViewportDeadline;
import jumin.domain.parking.monitoring.ViewportMetrics;
import jumin.domain.parking.service.ViewportCellCover;
import jumin.domain.parking.service.ViewportSquareGrid;
import jumin.global.exception.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

@SuppressWarnings("unchecked")
class RedisViewportFailureTest {

    @Test
    @DisplayName("동기 Redis 동시성 한도를 넘긴 요청만 거절하고 진행 중인 요청은 유지한다")
    void limits_concurrent_commands() throws Exception {
        // given
        ViewportCacheProperties properties = properties();
        properties.setMaxConcurrentRedis(2);
        CountDownLatch started = new CountDownLatch(2);
        CountDownLatch release = new CountDownLatch(1);
        try (Fixture fixture = new Fixture(properties); var threads = Executors.newVirtualThreadPerTaskExecutor()) {
            when(fixture.commands.<List<?>>eval(anyString(), eq(ScriptOutputType.MULTI), any(byte[][].class), any(byte[][].class)))
                    .thenAnswer(invocation -> {
                        started.countDown();
                        assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
                        return Collections.singletonList(null);
                    });
            // when
            var first = CompletableFuture.supplyAsync(() -> fixture.store.getMany(List.of(key(1)), deadline()), threads);
            var second = CompletableFuture.supplyAsync(() -> fixture.store.getMany(List.of(key(2)), deadline()), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            // then
            assertThatThrownBy(() -> fixture.store.getMany(List.of(key(3)), deadline())).isInstanceOf(ViewportStoreException.class);
            assertThat(fixture.count("transport_rejected")).isEqualTo(1);
            release.countDown();
            assertThat(first.get(5, TimeUnit.SECONDS)).isEmpty();
            assertThat(second.get(5, TimeUnit.SECONDS)).isEmpty();
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("정상 프로토콜 명령 오류는 연결을 유지하며 읽기와 쓰기를 다시 수행한다")
    void command_errors_keep_connection() {
        // given
        try (Fixture fixture = new Fixture(properties())) {
            when(fixture.commands.<List<?>>eval(anyString(), eq(ScriptOutputType.MULTI), any(byte[][].class), any(byte[][].class)))
                    .thenThrow(new RedisCommandExecutionException("read failed")).thenReturn(Collections.singletonList(null));
            when(fixture.commands.<Long>eval(anyString(), eq(ScriptOutputType.INTEGER), any(byte[][].class), any(byte[][].class)))
                    .thenThrow(new RedisCommandExecutionException("write failed")).thenReturn(1L);
            // when & then
            assertThatThrownBy(() -> fixture.store.getMany(List.of(key(1)), deadline())).isInstanceOf(ViewportStoreException.class);
            assertThat(fixture.store.getMany(List.of(key(1)), deadline())).isEmpty();
            assertThatThrownBy(() -> fixture.store.putMany(List.of(new ViewportCell(key(1), List.of())), deadline()))
                    .isInstanceOf(ViewportStoreException.class);
            fixture.store.putMany(List.of(new ViewportCell(key(1), List.of())), deadline());
            assertThat(fixture.count("command_error")).isEqualTo(2);
            verify(fixture.client, times(1)).connect(any(RedisCodec.class), any(RedisURI.class));
            verify(fixture.connection, never()).close();
        }
    }

    @Test
    @DisplayName("연결 장애 후 공유 연결의 복구된 명령은 별도 회로 대기 없이 성공한다")
    void connection_failure_allows_recovered_commands() {
        // given
        try (Fixture fixture = new Fixture(properties())) {
            when(fixture.commands.<List<?>>eval(anyString(), eq(ScriptOutputType.MULTI), any(byte[][].class), any(byte[][].class)))
                    .thenThrow(new RedisConnectionException("closed")).thenReturn(Collections.singletonList(null));
            // when & then
            assertThatThrownBy(() -> fixture.store.getMany(List.of(key(1)), deadline())).isInstanceOf(ViewportStoreException.class);
            assertThat(fixture.store.getMany(List.of(key(1)), deadline())).isEmpty();
            assertThat(fixture.count("connection_error")).isEqualTo(1);
            verify(fixture.client, times(1)).connect(any(RedisCodec.class), any(RedisURI.class));
            verify(fixture.connection, never()).close();
        }
    }

    @Test
    @DisplayName("한 명령의 시간 초과는 공유 연결을 닫지 않으며 다음 명령은 성공한다")
    void command_timeout_preserves_shared_connection() {
        // given
        try (Fixture fixture = new Fixture(properties())) {
            when(fixture.commands.<List<?>>eval(anyString(), eq(ScriptOutputType.MULTI), any(byte[][].class), any(byte[][].class)))
                    .thenThrow(new RedisCommandTimeoutException("timeout")).thenReturn(Collections.singletonList(null));
            // when & then
            assertThatThrownBy(() -> fixture.store.getMany(List.of(key(1)), deadline())).isInstanceOf(ViewportStoreException.class);
            assertThat(fixture.count("operation_timeout")).isEqualTo(1);
            verify(fixture.connection, never()).close();
            assertThat(fixture.store.getMany(List.of(key(1)), deadline())).isEmpty();
            assertThat(fixture.count("operation_timeout")).isEqualTo(1);
        }
    }

    @Test
    @DisplayName("최초 연결 실패는 슬롯을 반환하며 다음 요청은 연결을 다시 시도한다")
    void connect_failure_releases_capacity() {
        // given
        try (Fixture fixture = new Fixture(properties())) {
            when(fixture.client.connect(any(RedisCodec.class), any(RedisURI.class)))
                    .thenThrow(new RedisConnectionException("unreachable")).thenReturn(fixture.connection);
            when(fixture.commands.<List<?>>eval(anyString(), eq(ScriptOutputType.MULTI), any(byte[][].class), any(byte[][].class)))
                    .thenReturn(Collections.singletonList(null));
            // when & then
            assertThatThrownBy(() -> fixture.store.getMany(List.of(key(1)), deadline())).isInstanceOf(ViewportStoreException.class);
            assertThat(fixture.registry.get("parking.viewport.redis.active").gauge().value()).isZero();
            assertThat(fixture.store.getMany(List.of(key(1)), deadline())).isEmpty();
            assertThat(fixture.count("connection_error")).isEqualTo(1);
            verify(fixture.client, times(2)).connect(any(RedisCodec.class), any(RedisURI.class));
        }
    }

    @Test
    @DisplayName("늦게 열린 공유 연결은 만료 요청의 명령을 실행하지 않고 후속 요청에서 재사용한다")
    void reuses_late_connection_without_running_expired_command() throws Exception {
        // given
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (Fixture fixture = new Fixture(properties()); var threads = Executors.newVirtualThreadPerTaskExecutor()) {
            when(fixture.client.connect(any(RedisCodec.class), any(RedisURI.class))).thenAnswer(invocation -> {
                started.countDown();
                assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
                return fixture.connection;
            });
            ViewportDeadline deadline = ViewportDeadline.after(Duration.ofMillis(50));
            // when
            var request = CompletableFuture.supplyAsync(() -> fixture.store.getMany(List.of(key(1)), deadline), threads);
            assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
            while (deadline.remainingNanos() > 0) {
                Thread.sleep(1);
            }
            // then
            assertThat(request).isNotCompleted();
            release.countDown();
            assertThatThrownBy(() -> request.get(5, TimeUnit.SECONDS)).hasCauseInstanceOf(BusinessException.class);
            verify(fixture.commands, never()).eval(anyString(), eq(ScriptOutputType.MULTI), any(byte[][].class), any(byte[][].class));
            verify(fixture.connection, never()).close();
            when(fixture.commands.<List<?>>eval(anyString(), eq(ScriptOutputType.MULTI), any(byte[][].class), any(byte[][].class)))
                    .thenReturn(Collections.singletonList(null));
            assertThat(fixture.store.getMany(List.of(key(1)), deadline())).isEmpty();
            verify(fixture.client, times(1)).connect(any(RedisCodec.class), any(RedisURI.class));
            assertThat(fixture.registry.get("parking.viewport.redis.active").gauge().value()).isZero();
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("키 수와 저장 batch 한도 초과는 연결을 시작하지 않고 거절한다")
    void rejects_key_budget_before_connection() {
        // given
        ViewportCacheProperties properties = properties();
        try (Fixture fixture = new Fixture(properties)) {
            // when & then
            assertThatThrownBy(() -> fixture.store.getMany(LongStream.rangeClosed(1, MAX_CELLS + 1)
                    .mapToObj(RedisViewportFailureTest::key).toList(), deadline()))
                    .isInstanceOf(ViewportStoreBudgetException.class);
            assertThatThrownBy(() -> fixture.store.putMany(LongStream.rangeClosed(1, MAX_CELLS + 1)
                    .mapToObj(id -> new ViewportCell(key(id), List.of())).toList(), deadline())).isInstanceOf(ViewportStoreBudgetException.class);
            verify(fixture.client, never()).connect(any(RedisCodec.class), any(RedisURI.class));
        }
    }

    @Test
    @DisplayName("wire 용량 거절은 연결을 유지하며 후속 정상 조회를 허용한다")
    void wire_budget_keeps_connection() {
        // given
        try (Fixture fixture = new Fixture(properties())) {
            when(fixture.commands.<List<?>>eval(anyString(), eq(ScriptOutputType.MULTI), any(byte[][].class), any(byte[][].class)))
                    .thenAnswer(invocation -> List.of(-1L)).thenAnswer(invocation -> Collections.singletonList(null));
            // when & then
            assertThatThrownBy(() -> fixture.store.getMany(List.of(key(1)), deadline())).isInstanceOf(ViewportStoreBudgetException.class);
            assertThat(fixture.store.getMany(List.of(key(1)), deadline())).isEmpty();
            verify(fixture.connection, never()).close();
            assertThat(fixture.count("budget")).isEqualTo(1);
        }
    }

    private static ViewportCacheProperties properties() {
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setCacheTimeout(Duration.ofSeconds(10));
        return properties;
    }

    private static ViewportCellKey key(long id) {
        return new ViewportCellKey("failure", 1000, id);
    }

    private static ViewportDeadline deadline() {
        return ViewportDeadline.after(Duration.ofSeconds(10));
    }

    private static final class Fixture implements AutoCloseable {
        private final RedisClient client = mock(RedisClient.class);
        private final StatefulRedisConnection<byte[], byte[]> connection = mock(StatefulRedisConnection.class);
        private final RedisCommands<byte[], byte[]> commands = mock(RedisCommands.class);
        private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
        private final ViewportMetrics metrics = new ViewportMetrics(registry);
        private final MockedStatic<RedisClient> factory = mockStatic(RedisClient.class);
        private final RedisViewportCellStore store;

        private Fixture(ViewportCacheProperties properties) {
            when(connection.isOpen()).thenReturn(true);
            when(connection.sync()).thenReturn(commands);
            when(client.connect(any(RedisCodec.class), any(RedisURI.class))).thenReturn(connection);
            factory.when(() -> RedisClient.create(any(ClientResources.class), any(RedisURI.class))).thenReturn(client);
            store = new RedisViewportCellStore(properties,
                    new ViewportCellCodec(MAX_VALUE_BYTES, MAX_CELL_ROWS),
                    new ViewportCellCover(new ViewportSquareGrid()), metrics);
        }

        private double count(String outcome) {
            return registry.counter("parking.viewport.store_error", "outcome", outcome).count();
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
