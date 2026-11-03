package jumin.domain.parking;

import static jumin.config.ViewportCacheProperties.GRID_SIZE_METERS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.AdditionalAnswers.delegatesTo;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import jumin.TestcontainersConfiguration;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.cache.EmptyViewportCellStore;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
import jumin.domain.parking.model.ViewportBounds;
import jumin.domain.parking.model.ViewportCell;
import jumin.domain.parking.model.ViewportCellKey;
import jumin.domain.parking.model.ViewportDeadline;
import jumin.domain.parking.model.ViewportMappingState;
import jumin.domain.parking.monitoring.ViewportMetrics;
import jumin.domain.parking.repository.ViewportRepository;
import jumin.domain.parking.repository.ViewportReferenceRepository;
import jumin.domain.parking.service.ParkingLodScoreCalculator;
import jumin.domain.parking.service.ViewportCellCover;
import jumin.domain.parking.service.ViewportCellLoader;
import jumin.domain.parking.service.ViewportSearchService;
import jumin.domain.parking.service.ViewportSquareGrid;
import jumin.domain.parking.service.ViewportWriteCoordinator;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.postgresql.core.BaseConnection;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DelegatingDataSource;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest(properties = {"jumin.viewport.cache.enabled=true", "jumin.viewport.cache.environment=integration"})
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ViewportSearchIntegrationTest {

    private static final GenericContainer<?> REDIS = new GenericContainer<>(DockerImageName.parse("redis:7.4-alpine"))
            .withExposedPorts(6379);

    @DynamicPropertySource
    static void redisProperties(DynamicPropertyRegistry registry) {
        REDIS.start();
        registry.add("jumin.viewport.cache.redis-uri", () -> "redis://" + REDIS.getHost() + ":"
                + REDIS.getMappedPort(6379));
    }

    @AfterAll
    static void stopRedis() {
        REDIS.stop();
    }

    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private PlatformTransactionManager transactions;
    @Autowired
    private ViewportWriteCoordinator writer;
    @Autowired
    private ViewportSearchService service;
    @Autowired
    private ViewportReferenceRepository reference;
    @Autowired
    private ViewportCacheProperties properties;
    @Autowired
    private MeterRegistry metrics;
    @Autowired
    private ViewportRepository db;
    @MockitoBean
    private Clock clock;

    @Test
    @DisplayName("캐시 비활성 경로도 기존 DTO를 그대로 반환하고 셀 캐시 조회를 시작하지 않는다")
    void disabled_cache_preserves_reference_response() {
        // given
        ParkingLotViewportRequest request = request(0, 126.99, 37.49, 127.01, 37.51);
        ParkingLotViewportResponses expected = reference.searchViewport(request, clock);
        double lookups = counter("cells", "hit") + counter("cells", "miss");
        double fallbacks = counter("logical", "fallback");
        double queries = counter("sql", "viewport");
        boolean enabled = properties.isEnabled();
        properties.setEnabled(false);
        try {
            // when
            ParkingLotViewportResponses actual = service.search(request);

            // then
            assertThat(actual).isEqualTo(expected);
            assertThat(counter("cells", "hit") + counter("cells", "miss")).isEqualTo(lookups);
            assertThat(counter("logical", "fallback")).isEqualTo(fallbacks);
            assertThat(counter("sql", "viewport")).isEqualTo(queries + 1);
        } finally {
            properties.setEnabled(enabled);
        }
    }

    @Test
    @DisplayName("NOT NULL 이름 조건이 단순화돼도 사각형 partial index를 셀 조회의 접근 경로로 사용할 수 있다")
    void square_partial_index_remains_eligible_after_not_null_simplification() {
        // given
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            status.setRollbackOnly();
            jdbc.execute("SET LOCAL enable_seqscan=off");

            // when & then
            String plan = jdbc.queryForObject("EXPLAIN (FORMAT JSON) SELECT id,latitude,longitude,capacity "
                    + "FROM parking_lots source WHERE source.viewport_grid_cell=0 AND source.active=TRUE "
                    + "AND source.location IS NOT NULL AND source.name IS NOT NULL "
                    + "AND source.address IS NOT NULL ORDER BY source.id LIMIT 4097", String.class);

            assertThat(plan).contains("idx_parking_lots_viewport_grid_cell");
        });
    }

    @Test
    @DisplayName("동기 캐시 저장을 기다리는 요청이 있어도 DB 연결과 실행 슬롯은 반환한다")
    void cache_writes_do_not_occupy_real_database_workers() throws Exception {
        // given
        CountDownLatch writesStarted = new CountDownLatch(3);
        CountDownLatch releaseWrites = new CountDownLatch(1);
        EmptyViewportCellStore blockedStore = new EmptyViewportCellStore() {
            @Override
            public void putMany(List<ViewportCell> cells, ViewportDeadline deadline) {
                writesStarted.countDown();
                try {
                    assertThat(releaseWrites.await(5, TimeUnit.SECONDS)).isTrue();
                } catch (InterruptedException failure) {
                    Thread.currentThread().interrupt();
                }
            }
        };
        ViewportMappingState mappingState = mappingState();
        List<Long> cellIds = new ViewportCellCover(new ViewportSquareGrid())
                .cover(new ViewportBounds(126.99, 37.49, 127.01, 37.51)).stream().limit(3).toList();
        assertThat(cellIds).hasSize(3);
        try (ViewportCellLoader loader = new ViewportCellLoader(blockedStore, db,
                new ViewportMetrics(metrics)); var threads = Executors.newVirtualThreadPerTaskExecutor()) {
            try {
                // when & then
                List<CompletableFuture<List<ViewportCell>>> requests = new ArrayList<>();
                for (long cellId : cellIds) {
                    ViewportCellKey key = new ViewportCellKey(properties.getEnvironment(), mappingState.gridSizeMeters(), cellId);
                    requests.add(CompletableFuture.supplyAsync(() -> loader.resolve(List.of(key), Map.of(),
                            ViewportDeadline.after(Duration.ofSeconds(2)), false), threads));
                }
                assertThat(writesStarted.await(5, TimeUnit.SECONDS)).isTrue();
                assertThat(requests).allSatisfy(request -> assertThat(request).isNotCompleted());

                ViewportCellKey key = new ViewportCellKey(properties.getEnvironment(), GRID_SIZE_METERS, cellIds.getFirst());
                assertThat(db.load(List.of(key), ViewportDeadline.after(Duration.ofSeconds(1))))
                        .containsKey(key);
                assertThat(releaseWrites.getCount()).isEqualTo(1);
                releaseWrites.countDown();
                for (var request : requests) {
                    assertThat(request.get(5, TimeUnit.SECONDS)).hasSize(1);
                }
            } finally {
                releaseWrites.countDown();
            }
        }
    }

    @Test
    @DisplayName("각 fetch가 statement timeout보다 빨라도 전체 cursor deadline 후에는 성공을 전달하지 않는다")
    void enforces_total_deadline_across_real_cursor_fetches() {
        // given
        AtomicInteger consumed = new AtomicInteger();
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        ViewportRepository observed = observedRepository(connection -> {
            Connection tracked = mock(Connection.class, delegatesTo(connection));
            doAnswer(invocation -> {
                String sql = ((String) invocation.getArgument(0)).replaceFirst("SELECT ", "SELECT pg_sleep(0.05), ");
                PreparedStatement actual = connection.prepareStatement(sql);
                PreparedStatement statement = mock(PreparedStatement.class, delegatesTo(actual));
                doAnswer(call -> { actual.setFetchSize(8); return null; }).when(statement).setFetchSize(anyInt());
                doAnswer(call -> {
                    ResultSet actualRows = actual.executeQuery();
                    ResultSet rows = mock(ResultSet.class, delegatesTo(actualRows));
                    doAnswer(fetch -> {
                        boolean present = actualRows.next();
                        if (present) {
                            consumed.incrementAndGet();
                        }
                        return present;
                    }).when(rows).next();
                    return rows;
                }).when(statement).executeQuery();
                return statement;
            }).when(tracked).prepareStatement(anyString());
            return tracked;
        }, registry);
        ViewportDeadline deadline = ViewportDeadline.after(Duration.ofMillis(900));
        ParkingLotViewportRequest request = request(0, 126.99, 37.49, 127.01, 37.51);

        // when & then
        try {
            assertThatThrownBy(() -> observed.findWithinBounds(ViewportBounds.from(request), request, 1, deadline))
                    .isInstanceOfSatisfying(BusinessException.class, failure ->
                            assertThat(failure.getErrorCode()).isEqualTo(ErrorCode.VIEWPORT_UNAVAILABLE));
            assertThat(consumed.get()).isPositive().isLessThan(80);
            assertThat(deadline.remainingNanos()).isZero();
            assertThat(registry.get("parking.viewport.db.active").gauge().value()).isZero();
        } finally {
            observed.close();
            registry.close();
        }
    }

    @Test
    @DisplayName("전체 응답 준비 뒤 read-only commit 연결이 끊기면 성공 결과를 반환하지 않는다")
    void rejects_result_if_transaction_commit_fails() {
        // given
        AtomicBoolean prepared = new AtomicBoolean();
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        ViewportRepository observed = observedRepository(connection -> {
            Connection tracked = mock(Connection.class, delegatesTo(connection));
            doAnswer(invocation -> {
                prepared.set(true);
                connection.unwrap(BaseConnection.class).close();
                connection.commit();
                return null;
            }).when(tracked).commit();
            return tracked;
        }, registry);
        ParkingLotViewportRequest request = request(0, 126.99, 37.49, 127.01, 37.51);

        // when & then
        try {
            assertThatThrownBy(() -> observed.findWithinBounds(ViewportBounds.from(request), request, 1,
                    ViewportDeadline.after(Duration.ofSeconds(2))))
                    .isInstanceOf(RuntimeException.class);
            assertThat(prepared).isTrue();
            assertThat(registry.get("parking.viewport.db.active").gauge().value()).isZero();
        } finally {
            observed.close();
            registry.close();
        }
    }

    private ViewportRepository observedRepository(ConnectionCallback<Connection> decorator, MeterRegistry registry) {
        DelegatingDataSource source = new DelegatingDataSource(jdbc.getDataSource()) {
            @Override
            public Connection getConnection() throws SQLException {
                return decorator.doInConnection(super.getConnection());
            }
        };
        return new ViewportRepository(new JdbcTemplate(source), properties, new ViewportMetrics(registry),
                new ParkingLodScoreCalculator(), new ViewportSquareGrid());
    }

    private ViewportMappingState mappingState() {
        return jdbc.queryForObject("SELECT grid_size_meters, projection_ready FROM parking_viewport_cache_state WHERE id = 1",
                (rows, index) -> new ViewportMappingState(rows.getInt("grid_size_meters"), rows.getBoolean("projection_ready")));
    }

    @BeforeEach
    void prepareFixture() {
        setDay("2026-10-26");
        properties.setEnvironment(ttlEnvironment());
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            jdbc.update("""
                    UPDATE parking_viewport_cache_state SET projection_ready = FALSE, grid_size_meters = 1000 WHERE id = 1
                    """);
            jdbc.execute("TRUNCATE parking_lots RESTART IDENTITY CASCADE");
            Random random = new Random(20261028);
            for (int index = 0; index < 150; index++) {
                long id = index == 149 ? 9_007_199_254_740_993L : index + 1L;
                double latitude = 37.49 + random.nextDouble() * 0.02;
                double longitude = 126.99 + random.nextDouble() * 0.02;
                if (index < 4) {
                    latitude = index < 2 ? 37.495 : 37.505;
                    longitude = index % 2 == 0 ? 126.995 : 127.005;
                }
                jdbc.update("""
                        INSERT INTO parking_lots (id, source, source_external_id, name, address, latitude, longitude,
                        capacity, mechanical, is_public, active, source_checked_at, created_at, updated_at)
                        VALUES (?, 'DATA_GO_KR', ?, ?, 'test', ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
                        """, id, Long.toString(id), "test " + id, latitude, longitude,
                        index % 3 == 0 ? null : index, index % 2 == 0, tri(index / 3), index % 11 != 0);
                if (index % 13 != 0) {
                    jdbc.update("""
                            INSERT INTO parking_operations (parking_lot_id, weekday_paid, saturday_paid, holiday_paid,
                            source_checked_at, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())
                            """, id, tri(index / 9), tri(index / 27), tri(index / 81));
                }
            }
        });
        assertThat(writer.prepare().ready()).isTrue();
    }

    @Test
    @DisplayName("7요일과 8필터 조합에서 원본 JPA 기준과 캐시 OFF 및 cold/warm 결과가 같다")
    void matches_original_for_every_day_and_filter() {
        // given
        for (int day = 0; day < 7; day++) {
            setDay(LocalDate.of(2026, 10, 26).plusDays(day).toString());
            for (int mask = 0; mask < 8; mask++) {
                ParkingLotViewportRequest request = request(mask, 126.995, 37.495, 127.005, 37.505);
                ParkingLotViewportResponses expected = reference.searchViewport(request, clock);

                // when & then
                properties.setEnabled(false);
                try {
                    assertThat(search(request)).as("OFF day=%s mask=%s", day, mask).isEqualTo(expected);
                } finally {
                    properties.setEnabled(true);
                }
                assertThat(search(request)).as("day=%s mask=%s", day, mask).isEqualTo(expected);
                assertThat(search(request)).as("warm day=%s mask=%s", day, mask).isEqualTo(expected);
            }
        }
    }

    @Test
    @DisplayName("무작위 작은 viewport 150개에서 원본의 경계 판정과 정렬을 보존한다")
    void matches_original_for_random_bounds() {
        // given
        Random random = new Random(387);
        for (int index = 0; index < 150; index++) {
            double west = 126.99 + random.nextDouble() * 0.015;
            double south = 37.49 + random.nextDouble() * 0.015;
            ParkingLotViewportRequest request = request(index % 8, west, south, west + 0.005, south + 0.005);

            // when & then
            ParkingLotViewportResponses expected = reference.searchViewport(request, clock);
            assertThat(search(request)).as("random viewport %s", index).isEqualTo(expected);
            properties.setEnabled(false);
            try {
                assertThat(search(request)).as("OFF random viewport %s", index).isEqualTo(expected);
            } finally {
                properties.setEnabled(true);
            }
        }
    }

    @Test
    @DisplayName("서로 다른 작은 viewport도 같은 사각형 셀을 재사용해 source SQL을 추가하지 않는다")
    void reuses_square_cells_between_distinct_viewports() {
        // given
        ParkingLotViewportRequest first = request(0, 126.99999, 37.49999, 127.00001, 37.50001);
        ParkingLotViewportRequest second = request(0, 126.999991, 37.499991, 127.000011, 37.500011);
        ViewportCellCover cover = new ViewportCellCover(new ViewportSquareGrid());
        assertThat(cover.cover(ViewportBounds.from(first))).isNotEmpty()
                .isEqualTo(cover.cover(ViewportBounds.from(second)));
        double initial = counter("sql", "cell_batch");

        // when & then
        assertThat(search(first)).isEqualTo(reference.searchViewport(first, clock));
        double afterFirst = counter("sql", "cell_batch");
        assertThat(afterFirst).isGreaterThan(initial);
        assertThat(search(second)).isEqualTo(reference.searchViewport(second, clock));
        assertThat(counter("sql", "cell_batch")).isEqualTo(afterFirst);
    }

    @Test
    @DisplayName("DB 그리드 크기 불일치는 원본으로 우회하고 prepare 뒤 고정 크기의 셀을 재사용한다")
    void fences_old_grid_size_until_prepare() {
        // given
        ParkingLotViewportRequest request = request(0, 126.99, 37.49, 127.01, 37.51);
        jdbc.update("UPDATE parking_viewport_cache_state SET grid_size_meters = 2000 WHERE id = 1");
        try {
            double fallback = counter("sql", "viewport");
            // when & then
            assertThat(search(request)).isEqualTo(reference.searchViewport(request, clock));
            assertThat(counter("sql", "viewport")).isEqualTo(fallback + 1);
            ViewportMappingState prepared = writer.prepare();
            assertThat(prepared.gridSizeMeters()).isEqualTo(GRID_SIZE_METERS);
            assertThat(prepared.ready()).isTrue();
            assertThat(search(request)).isEqualTo(reference.searchViewport(request, clock));
            double source = counter("sql", "cell_batch");
            assertThat(search(request)).isEqualTo(reference.searchViewport(request, clock));
            assertThat(counter("sql", "cell_batch")).isEqualTo(source);
        } finally {
            writer.prepare();
        }
    }

    @Test
    @DisplayName("TTL miss 중 state 부재와 준비 안 됨 및 grid 불일치는 재시도 없이 전체 원본으로 우회한다")
    void ttl_miss_falls_back_for_missing_or_unusable_projection_state() {
        // given
        withFreshNamespace(() -> {
            ParkingLotViewportRequest request = request(0, 126.99, 37.49, 127.01, 37.51);
            ParkingLotViewportResponses expected = reference.searchViewport(request, clock);
            ViewportMappingState original = mappingState();
            for (String condition : List.of("missing", "not-ready", "wrong-grid")) {
                properties.setEnvironment(ttlEnvironment());
                try {
                    switch (condition) {
                        case "missing" -> jdbc.update("DELETE FROM parking_viewport_cache_state WHERE id = 1");
                        case "not-ready" -> jdbc.update("UPDATE parking_viewport_cache_state SET projection_ready = FALSE WHERE id = 1");
                        case "wrong-grid" -> jdbc.update("UPDATE parking_viewport_cache_state SET grid_size_meters = 2000 WHERE id = 1");
                        default -> throw new AssertionError(condition);
                    }

                    double sourcesBefore = counter("sql", "cell_batch");
                    double fallbacksBefore = counter("sql", "viewport");
                    double oversizeBypassesBefore = counter("requests", "oversize_bypass");

                    // when & then
                    assertThat(search(request)).as(condition).isEqualTo(expected);
                    assertThat(counter("sql", "cell_batch")).as(condition).isEqualTo(sourcesBefore + 1);
                    assertThat(counter("sql", "viewport")).as(condition).isEqualTo(fallbacksBefore + 1);
                    assertThat(counter("requests", "oversize_bypass")).as(condition)
                            .isEqualTo(oversizeBypassesBefore);
                } finally {
                    jdbc.update("""
                            INSERT INTO parking_viewport_cache_state
                                (id, grid_size_meters, projection_ready)
                            VALUES (1, ?, ?)
                            ON CONFLICT (id) DO UPDATE SET grid_size_meters = EXCLUDED.grid_size_meters,
                                projection_ready = EXCLUDED.projection_ready
                            """, original.gridSizeMeters(), original.ready());
                }
            }
        });
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    @DisplayName("캐시 OFF와 fallback은 전체 목록과 큰 정수 ID의 정렬을 그대로 반환한다")
    void returns_complete_response_from_both_whole_query_routes(boolean cacheEnabled) {
        // given
        ParkingLotViewportRequest request = request(0, 126.5, 37, 127.5, 38);
        ParkingLotViewportResponses expected = reference.searchViewport(request, clock);
        boolean enabled = properties.isEnabled();
        properties.setEnabled(cacheEnabled);
        try {
            // when
            ParkingLotViewportResponses actual = service.search(request);

            // then
            assertThat(actual).isEqualTo(expected);
            assertThat(actual.totalCount()).isGreaterThan(100);
            assertThat(actual.parkingLots().getLast().id()).isEqualTo(9_007_199_254_740_993L);
        } finally {
            properties.setEnabled(enabled);
        }
    }

    @Test
    @DisplayName("전체 조회는 평일과 주말의 모든 필터 조합에서 기존 조회와 같다")
    void fallback_matches_legacy_for_daily_filters() {
        // given
        for (String day : List.of("2026-10-26", "2026-10-31", "2026-11-01")) {
            setDay(day);
            for (int mask = 0; mask < 8; mask++) {
                ParkingLotViewportRequest request = request(mask, 126.5, 37, 127.5, 38);
                ParkingLotViewportResponses expected = reference.searchViewport(request, clock);

                // when & then
                ParkingLotViewportResponses actual = search(request);

                assertThat(actual).as("day=%s mask=%s", day, mask).isEqualTo(expected);
            }
        }
    }

    @Test
    @DisplayName("viewport cache 호출은 기존 transaction 안에서 실행될 수 없다")
    void rejects_ambient_transaction() {
        // given
        ParkingLotViewportRequest request = request(0, 126.99, 37.49, 127.01, 37.51);

        // when & then
        assertThatThrownBy(() -> new TransactionTemplate(transactions).execute(status -> service.search(request)))
                .isInstanceOf(IllegalTransactionStateException.class);
    }

    private void withFreshNamespace(Runnable test) {
        String previousEnvironment = properties.getEnvironment();
        try {
            properties.setEnvironment(ttlEnvironment());
            test.run();
        } finally {
            properties.setEnvironment(previousEnvironment);
        }
    }

    private String ttlEnvironment() {
        return "ttl_" + UUID.randomUUID().toString().replace("-", "");
    }

    private ParkingLotViewportResponses search(ParkingLotViewportRequest request) {
        return search(service, request);
    }

    private ParkingLotViewportResponses search(ViewportSearchService target, ParkingLotViewportRequest request) {
        return target.search(request);
    }

    private double counter(String name, String outcome) {
        return metrics.counter("parking.viewport." + name, "outcome", outcome).count();
    }

    private void setDay(String day) {
        when(clock.instant()).thenReturn(Instant.parse(day + "T01:00:00Z"));
        when(clock.getZone()).thenReturn(ZoneId.of("Asia/Seoul"));
    }

    private static Boolean tri(int value) {
        return switch (value % 3) {
            case 0 -> null;
            case 1 -> false;
            default -> true;
        };
    }

    private static ParkingLotViewportRequest request(int mask, double west, double south, double east, double north) {
        return new ParkingLotViewportRequest(west, south, east, north, (mask & 1) != 0, (mask & 2) != 0, (mask & 4) != 0);
    }
}
