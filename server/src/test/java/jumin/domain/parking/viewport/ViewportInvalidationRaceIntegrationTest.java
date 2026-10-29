package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;

import io.lettuce.core.RedisClient;
import io.lettuce.core.pubsub.RedisPubSubAdapter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import jumin.TestcontainersConfiguration;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
import jumin.domain.parking.service.ParkingLodScoreCalculator;
import jumin.domain.parking.service.ParkingSearchService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.utility.DockerImageName;

/** Exercises the current freshness limits with committed PostgreSQL writes and real Redis cells. */
@SpringBootTest(properties = {
        "jumin.viewport.cache.enabled=true",
        "jumin.viewport.cache.environment=feedback-integration",
        "jumin.viewport.cache.request-timeout=20s",
        "jumin.viewport.cache.db-timeout=5s"
})
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ViewportInvalidationRaceIntegrationTest {

    private static final GenericContainer<?> REDIS = new GenericContainer<>(DockerImageName.parse("redis:7.4-alpine"))
            .withExposedPorts(6379);
    private static final ParkingLotViewportRequest REQUEST = new ParkingLotViewportRequest(
            126.99999, 37.49999, 127.00001, 37.50001, false, false, false);
    private static final int OLD_CAPACITY = 50;
    private static final int NEW_CAPACITY = 200;

    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private ViewportWriteCoordinator writer;
    @Autowired private ViewportVersionRepository versions;
    @Autowired private ViewportDbAccess db;
    @Autowired private ViewportSpool spool;
    @Autowired private ParkingSearchService legacy;

    @BeforeAll
    static void startRedis() {
        REDIS.start();
    }

    @AfterAll
    static void stopRedis() {
        REDIS.stop();
    }

    @BeforeEach
    void prepareFixture() {
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            jdbc.update("""
                    UPDATE parking_viewport_cache_state SET dataset_epoch = ?, revision = 0,
                    projection_ready = FALSE, grid_size_meters = 1000 WHERE id = 1
                    """, UUID.randomUUID());
            jdbc.execute("TRUNCATE parking_lots RESTART IDENTITY CASCADE");
            jdbc.update("""
                    INSERT INTO parking_lots (id, source, source_external_id, name, address, latitude, longitude,
                    capacity, mechanical, is_public, active, source_checked_at, created_at, updated_at)
                    VALUES (1, 'DATA_GO_KR', '1', 'test', 'test', 37.5, 127, ?, FALSE, TRUE, TRUE,
                            NOW(), NOW(), NOW())
                    """, OLD_CAPACITY);
        });
        assertThat(writer.prepare().ready()).isTrue();
    }

    @Test
    @DisplayName("TTL 전용 warm 셀은 commit 뒤에도 이전 값을 제공하고 Redis 만료 뒤 원본을 다시 읽는다")
    void ttl_only_serves_old_value_after_commit_until_expiry_and_reloads() throws Exception {
        String environment = environment();
        RedisClient client = RedisClient.create(redisUri());
        try (var raw = client.connect(); var events = client.connectPubSub();
             Harness reader = new Harness(environment, false, false, Duration.ofSeconds(6))) {
            ViewportCellKey key = reader.ttlKey();
            CountDownLatch expired = new CountDownLatch(1);
            events.addListener(new RedisPubSubAdapter<>() {
                @Override
                public void message(String channel, String value) {
                    if (key.redisKey().equals(value)) {
                        expired.countDown();
                    }
                }
            });
            raw.sync().configSet("notify-keyspace-events", "Ex");
            events.sync().subscribe("__keyevent@0__:expired");

            assertCapacity(reader.search(), OLD_CAPACITY);
            reader.store.awaitWrite();
            assertThat(raw.sync().pttl(key.redisKey())).isPositive().isLessThanOrEqualTo(6000);
            double sourceReads = reader.sourceReads();

            commitCapacityChange();
            assertThat(jdbc.queryForObject("SELECT capacity FROM parking_lots WHERE id=1", Integer.class))
                    .isEqualTo(NEW_CAPACITY);
            assertCapacity(reader.search(), OLD_CAPACITY);
            assertThat(reader.sourceReads()).isEqualTo(sourceReads);
            assertThat(reader.redis.getMany(List.of(key), deadline())).containsOnlyKeys(key);

            assertThat(expired.await(15, TimeUnit.SECONDS)).as("actual Redis key expiration event").isTrue();
            assertThat(reader.redis.getMany(List.of(key), deadline())).isEmpty();
            assertCapacity(reader.search(), NEW_CAPACITY);
            assertThat(reader.sourceReads()).isGreaterThan(sourceReads);
        } finally {
            client.shutdown();
        }
    }

    @Test
    @DisplayName("수동 DEL 전에 읽은 TTL 셀의 늦은 put은 같은 namespace에 오래된 값을 되살린다")
    void manual_delete_can_be_followed_by_a_late_old_fill_in_same_namespace() throws Exception {
        String environment = environment();
        RedisClient client = RedisClient.create(redisUri());
        try (var raw = client.connect();
             Harness delayedReader = new Harness(environment, false, true, Duration.ofMinutes(1));
             Harness otherReader = new Harness(environment, false, false, Duration.ofMinutes(1))) {
            assertCapacity(delayedReader.search(), OLD_CAPACITY);
            delayedReader.store.awaitEntered();
            ViewportCellKey key = delayedReader.store.capturedKey();
            assertThat(delayedReader.store.capturedCapacity()).isEqualTo(OLD_CAPACITY);

            // A second application instance can fill the same cell while the first write is delayed.
            assertCapacity(otherReader.search(), OLD_CAPACITY);
            otherReader.store.awaitWrite();
            assertThat(raw.sync().exists(key.redisKey())).isEqualTo(1);
            commitCapacityChange();
            assertThat(raw.sync().del(key.redisKey())).isEqualTo(1);
            assertThat(delayedReader.redis.getMany(List.of(key), deadline())).isEmpty();

            delayedReader.store.release();
            delayedReader.store.awaitWrite();
            assertThat(delayedReader.redis.getMany(List.of(key), deadline()).get(key).items().getFirst().capacity())
                    .isEqualTo(OLD_CAPACITY);
            assertCapacity(otherReader.search(), OLD_CAPACITY);
            assertThat(jdbc.queryForObject("SELECT capacity FROM parking_lots WHERE id=1", Integer.class))
                    .isEqualTo(NEW_CAPACITY);
        } finally {
            client.shutdown();
        }
    }

    @Test
    @DisplayName("이전 TTL namespace의 늦은 put은 새 namespace의 응답을 오염시키지 않는다")
    void late_fill_in_old_namespace_cannot_pollute_new_namespace() throws Exception {
        try (Harness oldReader = new Harness(environment(), false, true, Duration.ofMinutes(1));
             Harness newReader = new Harness(environment(), false, false, Duration.ofMinutes(1))) {
            assertCapacity(oldReader.search(), OLD_CAPACITY);
            oldReader.store.awaitEntered();
            ViewportCellKey oldKey = oldReader.store.capturedKey();
            commitCapacityChange();

            assertCapacity(newReader.search(), NEW_CAPACITY);
            newReader.store.awaitWrite();
            ViewportCellKey newKey = newReader.store.capturedKey();
            assertThat(newKey.redisKey()).isNotEqualTo(oldKey.redisKey());
            oldReader.store.release();
            oldReader.store.awaitWrite();

            assertThat(oldReader.redis.getMany(List.of(oldKey), deadline()).get(oldKey).items().getFirst().capacity())
                    .isEqualTo(OLD_CAPACITY);
            assertThat(newReader.redis.getMany(List.of(newKey), deadline()).get(newKey).items().getFirst().capacity())
                    .isEqualTo(NEW_CAPACITY);
            assertCapacity(newReader.search(), NEW_CAPACITY);
        }
    }

    @Test
    @DisplayName("strict 모드에서는 commit 전 버전의 늦은 put이 새 버전 조회에 선택되지 않는다")
    void strict_mode_does_not_select_a_late_fill_from_an_old_revision() throws Exception {
        String environment = environment();
        try (Harness oldReader = new Harness(environment, true, true, Duration.ofMinutes(1));
             Harness newReader = new Harness(environment, true, false, Duration.ofMinutes(1))) {
            ViewportVersion before = versions.read();
            assertCapacity(oldReader.search(), OLD_CAPACITY);
            oldReader.store.awaitEntered();
            ViewportCellKey oldKey = oldReader.store.capturedKey();
            assertThat(oldKey.version()).isEqualTo(before);
            commitCapacityChange();

            assertCapacity(newReader.search(), NEW_CAPACITY);
            newReader.store.awaitWrite();
            ViewportCellKey newKey = newReader.store.capturedKey();
            assertThat(newKey.version().revision()).isEqualTo(before.revision() + 1);
            assertThat(newKey.redisKey()).isNotEqualTo(oldKey.redisKey());
            oldReader.store.release();
            oldReader.store.awaitWrite();

            assertThat(oldReader.redis.getMany(List.of(oldKey), deadline()).get(oldKey).items().getFirst().capacity())
                    .isEqualTo(OLD_CAPACITY);
            assertThat(newReader.redis.getMany(List.of(newKey), deadline()).get(newKey).items().getFirst().capacity())
                    .isEqualTo(NEW_CAPACITY);
            double sourceReads = newReader.sourceReads();
            assertCapacity(newReader.search(), NEW_CAPACITY);
            assertThat(newReader.sourceReads()).isEqualTo(sourceReads);
        }
    }

    private void commitCapacityChange() {
        ViewportVersion before = versions.read();
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            ViewportVersion ticket = writer.beforeSourceWrite();
            jdbc.update("UPDATE parking_lots SET capacity = ? WHERE id = 1", NEW_CAPACITY);
            writer.afterSourceWrite(ticket);
        });
        assertThat(versions.read().revision()).isEqualTo(before.revision() + 1);
    }

    private static void assertCapacity(ParkingLotViewportResponses response, int capacity) {
        assertThat(response.parkingLots()).hasSize(1);
        assertThat(response.parkingLots().getFirst().id()).isEqualTo(1L);
        assertThat(response.parkingLots().getFirst().score())
                .isEqualTo(new ParkingLodScoreCalculator().calculate(capacity));
    }

    private static String environment() {
        return "feedback_" + UUID.randomUUID().toString().replace("-", "");
    }

    private static String redisUri() {
        return "redis://" + REDIS.getHost() + ":" + REDIS.getMappedPort(6379);
    }

    private static ViewportDeadline deadline() {
        return ViewportDeadline.after(Duration.ofSeconds(5));
    }

    /** Separate loaders model independent application instances sharing one Redis server. */
    private final class Harness implements AutoCloseable {
        private final ViewportCacheProperties properties = new ViewportCacheProperties();
        private final ViewportMetrics metrics = new ViewportMetrics(new SimpleMeterRegistry());
        private final RedisViewportCellStore redis;
        private final ObservedStore store;
        private final ViewportCellLoader loader;
        private final ViewportSearchService service;
        private final ViewportCellCover cover;

        private Harness(String environment, boolean strict, boolean pauseWrite, Duration ttl) {
            properties.setEnabled(true);
            properties.setVersionCheckEnabled(strict);
            properties.setEnvironment(environment);
            properties.setStore(ViewportCacheProperties.Store.REDIS);
            properties.setRedisUri(redisUri());
            properties.setTtl(ttl);
            properties.setEmptyTtl(ttl);
            properties.setTtlJitter(0);
            properties.setRequestTimeout(Duration.ofSeconds(20));
            properties.setCacheTimeout(Duration.ofSeconds(2));
            cover = new ViewportCellCover(new ViewportSquareGrid(), properties);
            assertThat(cover.cover(ViewportBounds.from(REQUEST))).hasSize(1);
            redis = new RedisViewportCellStore(properties,
                    new ViewportCellCodec(properties.getMaxValueBytes(), properties.getMaxCellRows()), cover, metrics);
            store = new ObservedStore(redis, pauseWrite);
            ViewportReadRepository repository = new ViewportReadRepository(db, properties, metrics, spool);
            loader = new ViewportCellLoader(store, repository, properties, metrics);
            service = new ViewportSearchService(properties, legacy, cover, repository, store, loader, metrics,
                    new ParkingLodScoreCalculator(), Clock.fixed(Instant.parse("2026-10-26T00:00:00Z"), ZoneOffset.UTC));
        }

        private ViewportCellKey ttlKey() {
            return ViewportCellKey.ttlOnly(properties.getEnvironment(), properties.getSchema(), properties.getPolicy(),
                    properties.getGridSizeMeters(), cover.cover(ViewportBounds.from(REQUEST)).getFirst());
        }

        private ParkingLotViewportResponses search() {
            try (ViewportBody body = service.search(REQUEST)) {
                ParkingLotViewportResponses response = (ParkingLotViewportResponses) body.value();
                body.complete(true);
                return response;
            }
        }

        private double sourceReads() {
            return metrics.registry().counter("parking.viewport.sql", "outcome", "cell_batch").count();
        }

        @Override
        public void close() {
            store.release();
            loader.close();
            redis.close();
        }
    }

    /** Pauses only after the real source read completed and before the real Redis put starts. */
    private static final class ObservedStore implements ViewportCellStore {
        private final ViewportCellStore delegate;
        private final CountDownLatch entered = new CountDownLatch(1);
        private final CountDownLatch release;
        private final CountDownLatch written = new CountDownLatch(1);
        private final AtomicReference<List<ViewportCell>> cells = new AtomicReference<>();
        private final AtomicReference<Throwable> failure = new AtomicReference<>();

        private ObservedStore(ViewportCellStore delegate, boolean pauseWrite) {
            this.delegate = delegate;
            release = new CountDownLatch(pauseWrite ? 1 : 0);
        }

        @Override
        public Map<ViewportCellKey, ViewportCell> getMany(List<ViewportCellKey> keys, ViewportDeadline deadline) {
            return delegate.getMany(keys, deadline);
        }

        @Override
        public void putMany(List<ViewportCell> values, ViewportDeadline deadline) {
            cells.compareAndSet(null, List.copyOf(values));
            entered.countDown();
            try {
                if (!release.await(15, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("Timed out waiting to release the cache write");
                }
                delegate.putMany(values, deadline);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                failure.set(interrupted);
                throw new IllegalStateException(interrupted);
            } catch (RuntimeException | Error error) {
                failure.set(error);
                throw error;
            } finally {
                written.countDown();
            }
        }

        private void awaitEntered() throws InterruptedException {
            assertThat(entered.await(10, TimeUnit.SECONDS)).as("old source read reached the put boundary").isTrue();
        }

        private void awaitWrite() throws InterruptedException {
            assertThat(written.await(10, TimeUnit.SECONDS)).as("Redis write finished").isTrue();
            assertThat(failure.get()).as("Redis write failure").isNull();
        }

        private void release() {
            release.countDown();
        }

        private ViewportCellKey capturedKey() {
            assertThat(cells.get()).hasSize(1);
            return cells.get().getFirst().key();
        }

        private Integer capturedCapacity() {
            assertThat(cells.get()).hasSize(1);
            assertThat(cells.get().getFirst().items()).hasSize(1);
            return cells.get().getFirst().items().getFirst().capacity();
        }
    }
}
