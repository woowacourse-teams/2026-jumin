package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.lettuce.core.RedisClient;
import io.lettuce.core.KillArgs;
import io.lettuce.core.codec.ByteArrayCodec;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.stream.LongStream;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeoutException;
import jumin.config.ViewportCacheProperties;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.utility.DockerImageName;

class RedisViewportCellStoreTest {

    private static final GenericContainer<?> REDIS = new GenericContainer<>(DockerImageName.parse("redis:7.4-alpine"))
            .withExposedPorts(6379);

    @BeforeAll
    static void startRedis() {
        REDIS.start();
    }

    @AfterAll
    static void stopRedis() {
        REDIS.stop();
    }

    @Test
    @DisplayName("동기 직렬화는 실제 반환까지 기다리며 기한이 지난 값은 Redis에 저장하지 않는다")
    void retains_write_caller_until_actual_transport_finishes() throws Exception {
        ViewportCacheProperties properties = properties();
        ViewportCell cell = full(properties, 1);
        CountDownLatch encoding = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ViewportCellCodec delayed = new ViewportCellCodec(properties.getMaxValueBytes(),properties.getMaxCellRows()) {
            @Override
            public byte[] encode(ViewportCell value) {
                encoding.countDown();
                try {
                    assertThat(release.await(5,TimeUnit.SECONDS)).isTrue();
                } catch (InterruptedException failure) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(failure);
                }
                return super.encode(value);
            }
        };
        try (ViewportCellStore store = new RedisViewportCellStore(properties,delayed,
                new ViewportCellCover(new ViewportSquareGrid(),properties),new ViewportMetrics(new SimpleMeterRegistry()));
             var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            ViewportDeadline sourceDeadline=ViewportDeadline.after(Duration.ofMillis(100));
            var write=CompletableFuture.runAsync(() -> store.putMany(List.of(cell),sourceDeadline),executor);
            assertThat(encoding.await(5,TimeUnit.SECONDS)).isTrue();
            while(sourceDeadline.remainingNanos()>0) {
                Thread.sleep(1);
            }

            try {
                assertThatThrownBy(() -> write.get(50,TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            } finally {
                release.countDown();
            }
            assertThatThrownBy(() -> write.get(5,TimeUnit.SECONDS)).hasCauseInstanceOf(BusinessException.class);
            assertThat(store.getMany(List.of(cell.key()),deadline())).isEmpty();
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("혼합된 행 수 제한은 정상 값을 corrupt로 세지 않고 즉시 예산 우회한다")
    void classifies_row_budget_without_corruption_or_remote_deletion() {
        ViewportCacheProperties producerProperties = properties();
        producerProperties.setMaxCellRows(2);
        ViewportCacheProperties consumerProperties = properties();
        consumerProperties.setEnvironment(producerProperties.getEnvironment());
        consumerProperties.setMaxCellRows(1);
        ViewportCell first = full(producerProperties, 1);
        ViewportCell two = new ViewportCell(first.key(), List.of(item(1), item(2)));
        ViewportMetrics consumerMetrics = new ViewportMetrics(new SimpleMeterRegistry());
        try (ViewportCellStore producer = store(producerProperties);
             ViewportCellStore consumer = new RedisViewportCellStore(consumerProperties,
                     new ViewportCellCodec(consumerProperties.getMaxValueBytes(), 1),
                     new ViewportCellCover(new ViewportSquareGrid(), consumerProperties), consumerMetrics)) {
            producer.putMany(List.of(two), deadline());

            assertThatThrownBy(() -> consumer.getMany(List.of(two.key()), deadline()))
                    .isInstanceOf(ViewportStoreBudgetException.class);
            assertThat(consumerMetrics.registry().counter("parking.viewport.store", "outcome", "corrupt").count()).isZero();
            assertThat(producer.getMany(List.of(two.key()), deadline())).containsEntry(two.key(), two);
        }
    }

    @Test
    @DisplayName("wire 한도 이내의 큰 셀도 decoded 예산을 초과하면 정상 공유 값을 보존하며 우회한다")
    void rejects_decoded_budget_before_materialization() {
        ViewportCacheProperties producerProperties = properties();
        producerProperties.setMaxCellRows(16_384);
        producerProperties.setMaxValueBytes(512 * 1024);
        ViewportCacheProperties consumerProperties = properties();
        consumerProperties.setEnvironment(producerProperties.getEnvironment());
        consumerProperties.setMaxCellRows(16_384);
        consumerProperties.setMaxValueBytes(512 * 1024);
        consumerProperties.setMaxRequestBytes(512 * 1024);
        ViewportCell first = full(producerProperties, 1);
        ViewportCell large = new ViewportCell(first.key(), LongStream.range(1, 16_385).mapToObj(id ->
                new ViewportItem(id, 37.5, 127, null, false, true, false, false, false)).toList());
        assertThat(new ViewportCellCodec(512 * 1024, 16_384).encodedSize(large)).isLessThan(512 * 1024);
        try (ViewportCellStore producer = store(producerProperties); ViewportCellStore consumer = store(consumerProperties)) {
            producer.putMany(List.of(large), deadline());

            assertThatThrownBy(() -> consumer.getMany(List.of(large.key()), deadline()))
                    .isInstanceOf(ViewportStoreBudgetException.class);
            assertThat(producer.getMany(List.of(large.key()), deadline())).containsEntry(large.key(), large);
        }
    }

    @Test
    @DisplayName("다른 수신 한도를 가진 adapter가 공유 namespace의 유효한 값을 삭제하지 않는다")
    void preserves_valid_value_for_larger_consumer() {
        ViewportCacheProperties largeProperties = properties();
        ViewportCacheProperties smallProperties = properties();
        smallProperties.setEnvironment(largeProperties.getEnvironment());
        smallProperties.setMaxValueBytes(1024);
        ViewportCell first = full(largeProperties, 1);
        ViewportCell large = new ViewportCell(first.key(), LongStream.range(1, 61)
                .mapToObj(RedisViewportCellStoreTest::item).toList());
        try (ViewportCellStore producer = store(largeProperties); ViewportCellStore consumer = store(smallProperties)) {
            producer.putMany(List.of(large), deadline());

            assertThatThrownBy(() -> consumer.getMany(List.of(large.key()), deadline()))
                    .isInstanceOf(ViewportStoreBudgetException.class);
            assertThat(producer.getMany(List.of(large.key()), deadline())).containsEntry(large.key(), large);
        }
    }

    @Test
    @DisplayName("짧은 개인 deadline이 지나도 같은 정상 Redis 연결의 긴 요청은 성공한다")
    void personal_timeout_does_not_reset_shared_connection() throws Exception {
        ViewportCacheProperties properties = properties();
        ViewportCell full = full(properties, 1);
        RedisClient client = RedisClient.create(properties.getRedisUri());
        try (var raw = client.connect(ByteArrayCodec.INSTANCE); ViewportCellStore store = store(properties);
             var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            store.putMany(List.of(full), deadline());
            raw.sync().clientPause(500);
            var shortRequest = CompletableFuture.supplyAsync(() -> store.getMany(List.of(full.key()),
                    ViewportDeadline.after(Duration.ofMillis(150))), executor);
            var longRequest = CompletableFuture.supplyAsync(() -> store.getMany(List.of(full.key()), deadline()), executor);

            assertThatThrownBy(() -> shortRequest.get(3, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(BusinessException.class)
                    .satisfies(failure -> assertThat(((BusinessException) failure.getCause()).getErrorCode())
                            .isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE));
            assertThat(longRequest.get(3, TimeUnit.SECONDS)).containsEntry(full.key(), full);
            assertThat(store.getMany(List.of(full.key()), deadline())).containsEntry(full.key(), full);
        } finally {
            client.shutdown();
        }
    }

    @Test
    @DisplayName("개인 timeout 뒤 동기 명령이 반환하면 후속 요청이 Redis 용량을 재사용한다")
    void retains_transport_capacity_until_actual_command_completes() throws Exception {
        ViewportCacheProperties properties = properties();
        ViewportCell full = full(properties, 1);
        RedisClient client = RedisClient.create(properties.getRedisUri());
        try (var raw = client.connect(ByteArrayCodec.INSTANCE); ViewportCellStore store = store(properties);
             var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            store.putMany(List.of(full), deadline());
            raw.sync().clientPause(700);
            var requests = LongStream.range(0, 3).mapToObj(index -> CompletableFuture.supplyAsync(
                    () -> store.getMany(List.of(full.key()), ViewportDeadline.after(Duration.ofMillis(150))), executor)).toList();
            for (var request : requests) {
                assertThatThrownBy(() -> request.get(3, TimeUnit.SECONDS))
                        .hasCauseInstanceOf(BusinessException.class)
                        .satisfies(failure -> assertThat(((BusinessException) failure.getCause()).getErrorCode())
                                .isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE));
            }

            raw.sync().ping();
            long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
            while (true) {
                try {
                    assertThat(store.getMany(List.of(full.key()), deadline())).containsEntry(full.key(), full);
                    break;
                } catch (ViewportStoreException busy) {
                    assertThat(System.nanoTime()).isLessThan(until);
                    Thread.sleep(1);
                }
            }
        } finally {
            client.shutdown();
        }
    }

    @Test
    @DisplayName("실제 Redis에서 cold와 partial hit와 정상 empty payload를 구별한다")
    void handles_cold_partial_and_empty() {
        ViewportCacheProperties properties = properties();
        ViewportCell full = full(properties, 1);
        ViewportCell empty = new ViewportCell(key(properties, full.key().gridSizeMeters(), full.key().cellId() + 1), List.of());
        try (ViewportCellStore store = store(properties)) {
            assertThat(store.getMany(List.of(full.key(), empty.key()), deadline())).isEmpty();
            store.putMany(List.of(full), deadline());
            assertThat(store.getMany(List.of(full.key(), empty.key()), deadline())).containsOnlyKeys(full.key());
            store.putMany(List.of(empty), deadline());
            assertThat(store.getMany(List.of(full.key(), empty.key()), deadline()))
                    .containsEntry(full.key(), full).containsEntry(empty.key(), empty);
        }
    }

    @Test
    @DisplayName("잘못된 타입과 CRC 손상은 miss이며 정상 셀과 연결을 유지한다")
    void handles_corrupt_values() {
        ViewportCacheProperties properties = properties();
        ViewportCell full = full(properties, 1);
        ViewportCellKey wrong = key(properties, full.key().gridSizeMeters(), full.key().cellId() + 1);
        RedisClient client = RedisClient.create(properties.getRedisUri());
        try (var raw = client.connect(ByteArrayCodec.INSTANCE); ViewportCellStore store = store(properties)) {
            store.putMany(List.of(full), deadline());
            raw.sync().hset(text(wrong.redisKey()), text("field"), text("value"));

            assertThat(store.getMany(List.of(full.key(), wrong), deadline())).containsOnlyKeys(full.key());
            assertThat(raw.sync().exists(text(wrong.redisKey()))).isZero();
            raw.sync().set(text(wrong.redisKey()), new byte[80]);
            assertThat(store.getMany(List.of(full.key(), wrong), deadline())).containsOnlyKeys(full.key());
            assertThat(store.getMany(List.of(full.key()), deadline())).containsEntry(full.key(), full);
        } finally {
            client.shutdown();
        }
    }

    @Test
    @DisplayName("큰 단일 값과 expired deadline은 정상 연결의 회로를 열지 않는다")
    void rejects_size_and_expired_request_without_circuit() {
        ViewportCacheProperties properties = properties();
        properties.setMaxValueBytes(1024);
        ViewportCell full = full(properties, 1);
        ViewportCellKey wrong = key(properties, full.key().gridSizeMeters(), full.key().cellId() + 1);
        RedisClient client = RedisClient.create(properties.getRedisUri());
        try (var raw = client.connect(ByteArrayCodec.INSTANCE); ViewportCellStore store = store(properties)) {
            store.putMany(List.of(full), deadline());
            raw.sync().set(text(wrong.redisKey()), new byte[1025]);

            assertThatThrownBy(() -> store.getMany(List.of(wrong), deadline()))
                    .isInstanceOf(ViewportStoreBudgetException.class);
            assertThat(store.getMany(List.of(full.key()), deadline())).containsEntry(full.key(), full);
            assertThatThrownBy(() -> store.getMany(List.of(full.key()), new ViewportDeadline(System.nanoTime() - 1)))
                    .isInstanceOfSatisfying(BusinessException.class, failure ->
                            assertThat(failure.getErrorCode()).isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE));
            assertThat(store.getMany(List.of(full.key()), deadline())).containsEntry(full.key(), full);
        } finally {
            client.shutdown();
        }
    }

    @Test
    @DisplayName("직렬화 한도를 초과한 셀만 건너뛰고 같은 batch의 정상 셀은 저장한다")
    void skips_oversized_cell_only() {
        ViewportCacheProperties properties = properties();
        properties.setMaxValueBytes(1024);
        ViewportCell full = full(properties, 1);
        ViewportCell large = new ViewportCell(key(properties, full.key().gridSizeMeters(), full.key().cellId()),
                LongStream.range(1, 31).mapToObj(RedisViewportCellStoreTest::item).toList());
        ViewportCell empty = new ViewportCell(key(properties, full.key().gridSizeMeters(), full.key().cellId() + 1), List.of());
        try (ViewportCellStore store = store(properties)) {
            store.putMany(List.of(large, empty), deadline());

            assertThat(store.getMany(List.of(full.key(), empty.key()), deadline())).containsOnlyKeys(empty.key());
            store.putMany(List.of(full), deadline());
            assertThat(store.getMany(List.of(full.key()), deadline())).containsEntry(full.key(), full);
        }
    }

    @Test
    @DisplayName("서버 지연 timeout 뒤 후속 요청은 같은 연결에서 정상 응답으로 복구된다")
    void recovers_after_timeout_under_repeated_requests() throws Exception {
        // given
        ViewportCacheProperties properties = properties();
        properties.setRedisConnectTimeout(Duration.ofSeconds(1));
        properties.setCacheTimeout(Duration.ofMillis(50));
        ViewportCell full = full(properties, 1);
        ViewportMetrics metrics = new ViewportMetrics(new SimpleMeterRegistry());
        RedisClient client = RedisClient.create(properties.getRedisUri());
        try (var raw = client.connect(ByteArrayCodec.INSTANCE);
             ViewportCellStore store = new RedisViewportCellStore(properties,
                     new ViewportCellCodec(properties.getMaxValueBytes(), properties.getMaxCellRows()),
                     new ViewportCellCover(new ViewportSquareGrid(), properties), metrics)) {
            store.putMany(List.of(full), deadline());
            raw.sync().clientPause(250);
            // when
            assertThatThrownBy(() -> store.getMany(List.of(full.key()), deadline()))
                    .isInstanceOf(ViewportStoreException.class);
            // then
            assertThat(metrics.registry().counter("parking.viewport.store_error", "outcome", "operation_timeout").count())
                    .isEqualTo(1);
            long until = System.nanoTime() + Duration.ofSeconds(3).toNanos();
            while (true) {
                try {
                    assertThat(store.getMany(List.of(full.key()), deadline())).containsEntry(full.key(), full);
                    break;
                } catch (ViewportStoreException unavailable) {
                    assertThat(System.nanoTime()).isLessThan(until);
                    Thread.sleep(25);
                }
            }
        } finally {
            client.shutdown();
        }
    }

    @Test
    @DisplayName("실제 Redis가 연결을 끊어도 공유 연결은 재연결하여 저장된 셀을 다시 읽는다")
    void reconnects_after_server_disconnect() throws Exception {
        // given
        ViewportCacheProperties properties = properties();
        ViewportCell full = full(properties, 1);
        RedisClient client = RedisClient.create(properties.getRedisUri());
        try (var raw = client.connect(ByteArrayCodec.INSTANCE); ViewportCellStore store = store(properties)) {
            store.putMany(List.of(full), deadline());
            // when
            assertThat(raw.sync().clientKill(KillArgs.Builder.typeNormal().skipme())).isEqualTo(1);
            // then
            long until = System.nanoTime() + Duration.ofSeconds(5).toNanos();
            while (true) {
                try {
                    assertThat(store.getMany(List.of(full.key()), deadline())).containsEntry(full.key(), full);
                    break;
                } catch (ViewportStoreException disconnected) {
                    assertThat(System.nanoTime()).isLessThan(until);
                    Thread.sleep(25);
                }
            }
        } finally {
            client.shutdown();
        }
    }

    private static ViewportCacheProperties properties() {
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setEnvironment("redis-test-" + UUID.randomUUID());
        properties.setRedisUri("redis://" + REDIS.getHost() + ":" + REDIS.getMappedPort(6379));
        properties.setCacheTimeout(Duration.ofSeconds(1));
        return properties;
    }

    private static RedisViewportCellStore store(ViewportCacheProperties properties) {
        return new RedisViewportCellStore(properties,
                new ViewportCellCodec(properties.getMaxValueBytes(), properties.getMaxCellRows()),
                new ViewportCellCover(new ViewportSquareGrid(), properties),
                new ViewportMetrics(new SimpleMeterRegistry()));
    }

    private static ViewportCell full(ViewportCacheProperties properties, long id) {
        long cell = new ViewportSquareGrid().cellId(37.5, 127, 1000);
        return new ViewportCell(key(properties, 1000, cell),
                List.of(item(id)));
    }

    private static ViewportCellKey key(ViewportCacheProperties properties, int gridSizeMeters, long cell) {
        return new ViewportCellKey(properties.getEnvironment(), 1, 1, gridSizeMeters, cell);
    }

    private static ViewportItem item(long id) {
        return new ViewportItem(id, 37.5, 127, 50, false, true, false, false, false);
    }

    private static byte[] text(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }

    private static ViewportDeadline deadline() {
        return ViewportDeadline.after(Duration.ofSeconds(3));
    }
}
