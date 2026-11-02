package jumin.domain.parking.cache;

import static jumin.config.ViewportCacheProperties.MAX_CELL_ROWS;
import static jumin.config.ViewportCacheProperties.MAX_VALUE_BYTES;
import static jumin.config.ViewportCacheProperties.MAX_REQUEST_BYTES;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.lettuce.core.KillArgs;
import io.lettuce.core.RedisClient;
import io.lettuce.core.codec.ByteArrayCodec;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.stream.IntStream;
import java.util.stream.LongStream;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.exception.ViewportStoreBudgetException;
import jumin.domain.parking.exception.ViewportStoreException;
import jumin.domain.parking.model.ViewportCell;
import jumin.domain.parking.model.ViewportCellKey;
import jumin.domain.parking.model.ViewportDeadline;
import jumin.domain.parking.model.ViewportItem;
import jumin.domain.parking.monitoring.ViewportMetrics;
import jumin.domain.parking.service.ViewportCellCover;
import jumin.domain.parking.service.ViewportSquareGrid;
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
        // given
        ViewportCacheProperties properties = properties();
        ViewportCell cell = full(properties, 1);
        CountDownLatch encoding = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ViewportCellCodec delayed = new ViewportCellCodec(MAX_VALUE_BYTES, MAX_CELL_ROWS) {
            @Override
            public byte[] encode(ViewportCell value) {
                encoding.countDown();
                try {
                    assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
                } catch (InterruptedException failure) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(failure);
                }
                return super.encode(value);
            }
        };
        try (ViewportCellStore store = new RedisViewportCellStore(properties, delayed,
                new ViewportCellCover(new ViewportSquareGrid()), new ViewportMetrics(new SimpleMeterRegistry()));
             var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            ViewportDeadline sourceDeadline = ViewportDeadline.after(Duration.ofMillis(100));

            // when & then
            var write = CompletableFuture.runAsync(() -> store.putMany(List.of(cell), sourceDeadline), executor);
            assertThat(encoding.await(5, TimeUnit.SECONDS)).isTrue();
            while (sourceDeadline.remainingNanos() > 0) {
                Thread.sleep(1);
            }

            try {
                assertThatThrownBy(() -> write.get(50, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
            } finally {
                release.countDown();
            }
            assertThatThrownBy(() -> write.get(5, TimeUnit.SECONDS)).hasCauseInstanceOf(BusinessException.class);
            assertThat(store.getMany(List.of(cell.key()), deadline())).isEmpty();
        } finally {
            release.countDown();
        }
    }

    @Test
    @DisplayName("혼합된 행 수 제한은 정상 값을 corrupt로 세지 않고 즉시 예산 우회한다")
    void classifies_row_budget_without_corruption_or_remote_deletion() {
        // given
        ViewportCacheProperties producerProperties = properties();
        ViewportCacheProperties consumerProperties = properties();
        consumerProperties.setEnvironment(producerProperties.getEnvironment());
        ViewportCell first = full(producerProperties, 1);
        ViewportCell two = new ViewportCell(first.key(), List.of(item(1), item(2)));
        SimpleMeterRegistry consumerRegistry = new SimpleMeterRegistry();
        ViewportMetrics consumerMetrics = new ViewportMetrics(consumerRegistry);
        try (ViewportCellStore producer = store(producerProperties);
             ViewportCellStore consumer = new RedisViewportCellStore(consumerProperties,
                     new ViewportCellCodec(MAX_VALUE_BYTES, 1),
                     new ViewportCellCover(new ViewportSquareGrid()), consumerMetrics)) {
            // when & then
            producer.putMany(List.of(two), deadline());

            assertThatThrownBy(() -> consumer.getMany(List.of(two.key()), deadline()))
                    .isInstanceOf(ViewportStoreBudgetException.class);
            assertThat(consumerRegistry.counter("parking.viewport.store", "outcome", "corrupt").count()).isZero();
            assertThat(producer.getMany(List.of(two.key()), deadline())).containsEntry(two.key(), two);
        }
    }

    @Test
    @DisplayName("고정 decoded 일괄 예산을 넘는 읽기와 저장은 정상 공유 값을 보존하며 우회한다")
    void rejects_decoded_budget_before_materialization() {
        // given
        ViewportCacheProperties properties = properties();
        ViewportSquareGrid grid = new ViewportSquareGrid();
        List<ViewportCell> cells = IntStream.range(0, 10).mapToObj(index -> {
            double latitude = 37.5 + index * 0.01;
            ViewportCellKey key = new ViewportCellKey(properties.getEnvironment(), 1000,
                    grid.cellId(latitude, 127, 1000));
            return new ViewportCell(key, LongStream.rangeClosed(1, MAX_CELL_ROWS).mapToObj(id ->
                    new ViewportItem(id, latitude, 127, null, false, true, false, false, false)).toList());
        }).toList();
        ViewportCellCodec codec = new ViewportCellCodec(MAX_VALUE_BYTES, MAX_CELL_ROWS);
        assertThat(cells.stream().mapToLong(codec::encodedSize).sum()).isLessThan(MAX_REQUEST_BYTES);
        assertThat(cells.stream().mapToLong(ViewportCell::estimatedHeapBytes).sum()).isGreaterThan(MAX_REQUEST_BYTES);
        try (ViewportCellStore store = store(properties)) {
            for (ViewportCell cell : cells) {
                store.putMany(List.of(cell), deadline());
            }
            // when & then
            assertThatThrownBy(() -> store.getMany(cells.stream().map(ViewportCell::key).toList(), deadline()))
                    .isInstanceOf(ViewportStoreBudgetException.class);
            assertThatThrownBy(() -> store.putMany(cells, deadline())).isInstanceOf(ViewportStoreBudgetException.class);
            for (ViewportCell cell : cells) {
                assertThat(store.getMany(List.of(cell.key()), deadline())).containsEntry(cell.key(), cell);
            }
        }
    }

    @Test
    @DisplayName("수신 바이트 한도를 초과한 유효한 공유 값은 삭제하지 않고 우회한다")
    void preserves_valid_value_above_wire_limit() {
        // given
        ViewportCacheProperties properties = properties();
        ViewportCell first = full(properties, 1);
        ViewportCell large = new ViewportCell(first.key(), LongStream.rangeClosed(1, 8192)
                .mapToObj(RedisViewportCellStoreTest::item).toList());
        ViewportCellCodec largerCodec = new ViewportCellCodec(512 * 1024, 8192);
        byte[] payload = largerCodec.encode(large);
        assertThat(payload.length).isGreaterThan(MAX_VALUE_BYTES);
        RedisClient client = RedisClient.create(properties.getRedisUri());
        try (var raw = client.connect(ByteArrayCodec.INSTANCE); ViewportCellStore store = store(properties)) {
            raw.sync().set(text(large.key().redisKey()), payload);
            // when & then
            assertThatThrownBy(() -> store.getMany(List.of(large.key()), deadline()))
                    .isInstanceOf(ViewportStoreBudgetException.class);
            byte[] preserved = raw.sync().get(text(large.key().redisKey()));
            assertThat(preserved).isEqualTo(payload);
            assertThat(largerCodec.decode(large.key(), preserved, MAX_REQUEST_BYTES)).isEqualTo(large);
        } finally {
            client.shutdown();
        }
    }

    @Test
    @DisplayName("짧은 개인 deadline이 지나도 같은 정상 Redis 연결의 긴 요청은 성공한다")
    void personal_timeout_does_not_reset_shared_connection() throws Exception {
        // given
        ViewportCacheProperties properties = properties();
        ViewportCell full = full(properties, 1);
        RedisClient client = RedisClient.create(properties.getRedisUri());
        try (var raw = client.connect(ByteArrayCodec.INSTANCE); ViewportCellStore store = store(properties);
             var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            store.putMany(List.of(full), deadline());

            // when & then
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
        // given
        ViewportCacheProperties properties = properties();
        ViewportCell full = full(properties, 1);
        RedisClient client = RedisClient.create(properties.getRedisUri());
        try (var raw = client.connect(ByteArrayCodec.INSTANCE); ViewportCellStore store = store(properties);
             var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            store.putMany(List.of(full), deadline());

            // when & then
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
        // given
        ViewportCacheProperties properties = properties();
        ViewportCell full = full(properties, 1);
        ViewportCell empty = new ViewportCell(key(properties, full.key().gridSizeMeters(), full.key().cellId() + 1), List.of());
        try (ViewportCellStore store = store(properties)) {
            // when & then
            assertThat(store.getMany(List.of(full.key(), empty.key()), deadline())).isEmpty();
            store.putMany(List.of(full), deadline());
            assertThat(store.getMany(List.of(full.key(), empty.key()), deadline())).containsOnlyKeys(full.key());
            store.putMany(List.of(empty), deadline());
            assertThat(store.getMany(List.of(full.key(), empty.key()), deadline()))
                    .containsEntry(full.key(), full).containsEntry(empty.key(), empty);
        }
    }

    @Test
    @DisplayName("일반 셀과 빈 셀의 TTL은 각각 설정값의 ±20% 범위로 무작위 분산된다")
    void spreads_ttls_within_fixed_twenty_percent() {
        // given
        ViewportCacheProperties properties = properties();
        properties.setTtl(Duration.ofMinutes(10));
        properties.setEmptyTtl(Duration.ofMinutes(1));
        ViewportCell full = full(properties, 1);
        List<ViewportCell> cells = LongStream.range(0, 32)
                .mapToObj(offset -> {
                    if (offset == 0) {
                        return full;
                    }
                    return new ViewportCell(
                            key(properties, full.key().gridSizeMeters(), full.key().cellId() + offset), List.of());
                })
                .toList();
        RedisClient client = RedisClient.create(properties.getRedisUri());
        try (var raw = client.connect(); ViewportCellStore store = store(properties)) {
            // when
            long started = System.nanoTime();
            store.putMany(cells, deadline());
            long fullTtl = raw.sync().pttl(full.key().redisKey());
            List<Long> emptyTtls = cells.subList(1, cells.size()).stream()
                    .map(cell -> raw.sync().pttl(cell.key().redisKey()))
                    .toList();
            long elapsedMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) + 2;
            // then
            assertThat(fullTtl).isPositive().isBetween(480_000 - elapsedMillis, 720_000L);
            assertThat(emptyTtls).allSatisfy(ttl ->
                    assertThat(ttl).isPositive().isBetween(48_000 - elapsedMillis, 72_000L));
            assertThat(emptyTtls.stream().distinct().count()).isGreaterThan(1);
        } finally {
            client.shutdown();
        }
    }

    @Test
    @DisplayName("잘못된 타입과 CRC 손상은 miss이며 정상 셀과 연결을 유지한다")
    void handles_corrupt_values() {
        // given
        ViewportCacheProperties properties = properties();
        ViewportCell full = full(properties, 1);
        ViewportCellKey wrong = key(properties, full.key().gridSizeMeters(), full.key().cellId() + 1);
        RedisClient client = RedisClient.create(properties.getRedisUri());
        try (var raw = client.connect(ByteArrayCodec.INSTANCE); ViewportCellStore store = store(properties)) {
            store.putMany(List.of(full), deadline());
            raw.sync().hset(text(wrong.redisKey()), text("field"), text("value"));

            // when & then
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
        // given
        ViewportCacheProperties properties = properties();
        ViewportCell full = full(properties, 1);
        ViewportCellKey wrong = key(properties, full.key().gridSizeMeters(), full.key().cellId() + 1);
        RedisClient client = RedisClient.create(properties.getRedisUri());
        try (var raw = client.connect(ByteArrayCodec.INSTANCE); ViewportCellStore store = store(properties)) {
            store.putMany(List.of(full), deadline());
            raw.sync().set(text(wrong.redisKey()), new byte[MAX_VALUE_BYTES + 1]);

            // when & then
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
    @DisplayName("행 또는 직렬화 한도를 초과한 셀만 건너뛰고 같은 batch의 정상 셀은 저장한다")
    void skips_oversized_cell_only() {
        // given
        ViewportCacheProperties properties = properties();
        ViewportCell full = full(properties, 1);
        ViewportCell large = new ViewportCell(full.key(), List.of(item(1), item(2)));
        ViewportCell tooManyRows = new ViewportCell(full.key(), LongStream.rangeClosed(1, MAX_CELL_ROWS + 1)
                .mapToObj(RedisViewportCellStoreTest::item).toList());
        ViewportCell empty = new ViewportCell(key(properties, full.key().gridSizeMeters(), full.key().cellId() + 1), List.of());
        ViewportCellCodec codec = new ViewportCellCodec(MAX_VALUE_BYTES, MAX_CELL_ROWS) {
            @Override
            public long encodedSize(ViewportCell cell) {
                if (cell == large) {
                    return MAX_VALUE_BYTES + 1L;
                }
                return super.encodedSize(cell);
            }
        };
        try (ViewportCellStore store = new RedisViewportCellStore(properties, codec,
                new ViewportCellCover(new ViewportSquareGrid()), new ViewportMetrics(new SimpleMeterRegistry()))) {
            // when
            store.putMany(List.of(large, tooManyRows, empty), deadline());
            // then
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
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        ViewportMetrics metrics = new ViewportMetrics(registry);
        RedisClient client = RedisClient.create(properties.getRedisUri());
        try (var raw = client.connect(ByteArrayCodec.INSTANCE);
             ViewportCellStore store = new RedisViewportCellStore(properties,
                     new ViewportCellCodec(MAX_VALUE_BYTES, MAX_CELL_ROWS),
                     new ViewportCellCover(new ViewportSquareGrid()), metrics)) {
            store.putMany(List.of(full), deadline());
            raw.sync().clientPause(250);
            // when
            assertThatThrownBy(() -> store.getMany(List.of(full.key()), deadline()))
                    .isInstanceOf(ViewportStoreException.class);
            // then
            assertThat(registry.counter("parking.viewport.store_error", "outcome", "operation_timeout").count())
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
                new ViewportCellCodec(MAX_VALUE_BYTES, MAX_CELL_ROWS),
                new ViewportCellCover(new ViewportSquareGrid()),
                new ViewportMetrics(new SimpleMeterRegistry()));
    }

    private static ViewportCell full(ViewportCacheProperties properties, long id) {
        long cell = new ViewportSquareGrid().cellId(37.5, 127, 1000);
        return new ViewportCell(key(properties, 1000, cell),
                List.of(item(id)));
    }

    private static ViewportCellKey key(ViewportCacheProperties properties, int gridSizeMeters, long cell) {
        return new ViewportCellKey(properties.getEnvironment(), gridSizeMeters, cell);
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
