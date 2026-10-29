package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.time.Duration;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.CountDownLatch;
import java.util.Map;
import com.zaxxer.hikari.HikariDataSource;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.net.URI;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.util.ArrayList;
import org.springframework.transaction.TransactionSystemException;
import org.springframework.dao.DataAccessException;
import org.postgresql.PGConnection;
import jumin.TestcontainersConfiguration;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
import jumin.domain.parking.service.ParkingLodScoreCalculator;
import jumin.domain.parking.service.ParkingSearchService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ConnectionCallback;
import org.postgresql.core.BaseConnection;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(properties = {"jumin.viewport.cache.enabled=true", "jumin.viewport.cache.environment=integration"})
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ViewportSearchIntegrationTest {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private ViewportWriteCoordinator writer;
    @Autowired private ViewportVersionRepository versions;
    @Autowired private ViewportSearchService service;
    @Autowired private ParkingSearchService legacy;
    @Autowired private ViewportCacheProperties properties;
    @Autowired private MeterRegistry metrics;
    @Autowired private ViewportDbAccess db;
    @Autowired private ViewportSpool spool;
    @Autowired private ViewportCellStore cellStore;
    @MockitoBean private Clock clock;

    @Test
    @DisplayName("metadata는 같은 primary 연결의 autocommit 단일 SELECT이며 트랜잭션 잠금을 남기지 않는다")
    void metadata_uses_autocommit_without_explicit_transaction_roundtrips() {
        // given
        long lockKey = 1448083456999L;

        // when
        Boolean independentlyAcquired = db.read("version", ViewportDeadline.after(Duration.ofSeconds(2)), metadataJdbc -> {
            assertThat(metadataJdbc.execute((ConnectionCallback<Boolean>) Connection::getAutoCommit)).isTrue();
            assertThat(metadataJdbc.queryForObject("SELECT pg_try_advisory_xact_lock(?)", Boolean.class, lockKey)).isTrue();
            // The first statement has committed before this distinct primary connection runs.
            return jdbc.queryForObject("SELECT pg_try_advisory_xact_lock(?)", Boolean.class, lockKey);
        });

        // then
        assertThat(independentlyAcquired).isTrue();
    }

    @Test
    @DisplayName("NOT NULL 이름 조건이 단순화돼도 사각형 partial index를 셀 조회의 접근 경로로 사용할 수 있다")
    void square_partial_index_remains_eligible_after_not_null_simplification() {
        // given
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            status.setRollbackOnly();
            jdbc.execute("SET LOCAL enable_seqscan=off");
            jdbc.execute("SET LOCAL ROLE jumin_viewport_read");

            // when
            String plan=jdbc.queryForObject("EXPLAIN (FORMAT JSON) SELECT id,latitude,longitude,capacity "
                    + "FROM parking_lots source WHERE source.viewport_grid_cell=0 AND source.active=TRUE "
                    + "AND source.location IS NOT NULL AND source.name IS NOT NULL "
                    + "AND source.address IS NOT NULL ORDER BY source.id LIMIT 4097", String.class);

            // then
            assertThat(plan).contains("idx_parking_lots_viewport_grid_cell");
        });
    }

    @Test
    @DisplayName("observer의 같은 이름 임시 view가 privileged 관측 함수의 시스템 조회를 가로채지 못한다")
    void session_monitor_ignores_observer_temporary_view() {
        // given
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            status.setRollbackOnly();
            jdbc.execute("SET LOCAL ROLE jumin_viewport_observer");
            jdbc.execute("CREATE TEMP VIEW pg_stat_activity AS SELECT 'viewport_fake_reader'::name AS usename, "
                    + "pg_backend_pid() AS pid, 'client backend'::text AS backend_type, 1::oid AS usesysid");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM pg_temp.pg_stat_activity", Long.class)).isOne();

            // when & then
            assertThat(jdbc.queryForObject("SELECT public.viewport_cache_sessions_pending(?::name,?::name)",
                    Boolean.class, "viewport_fake_reader", "viewport_fake_observer")).isFalse();
            assertThat(jdbc.queryForObject("SELECT proconfig::text FROM pg_catalog.pg_proc WHERE "
                    + "oid='public.viewport_cache_sessions_pending(name,name)'::regprocedure", String.class))
                    .contains("pg_catalog, pg_temp");
        });
    }

    @Test
    @DisplayName("관측 함수의 owner가 stats 권한을 잃으면 세션 없음으로 오인하지 않고 명시적으로 실패한다")
    void session_monitor_fails_closed_without_owner_privilege() {
        // given & when & then
        assertThatThrownBy(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
            jdbc.execute("CREATE ROLE viewport_stats_owner_without_permissions NOLOGIN NOSUPERUSER");
            jdbc.execute("ALTER FUNCTION public.viewport_cache_sessions_pending(NAME,NAME) "
                    + "OWNER TO viewport_stats_owner_without_permissions");
            jdbc.execute("SET LOCAL ROLE jumin_viewport_observer");
            jdbc.queryForObject("SELECT public.viewport_cache_sessions_pending(?::name,?::name)",
                    Boolean.class,"jumin_viewport_read","jumin_viewport_observer");
        })).isInstanceOf(DataAccessException.class).rootCause().hasMessageContaining("pg_read_all_stats");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM pg_roles WHERE rolname='viewport_stats_owner_without_permissions'",
                Long.class)).isZero();
    }

    @Test
    @DisplayName("권한을 제한한 observer도 미인증 backend를 좁은 함수로 관측하고 종료 전에는 fence를 유지한다")
    void retains_unknown_fence_for_real_pre_authentication_backend() throws Exception {
        // given
        assertThat(jdbc.queryForObject("SELECT pg_has_role('jumin_viewport_observer', 'pg_read_all_stats', 'USAGE')",
                Boolean.class)).isFalse();
        assertThat(jdbc.queryForObject("SELECT has_function_privilege('jumin_viewport_read', "
                + "'public.viewport_cache_sessions_pending(name,name)', 'EXECUTE')",Boolean.class)).isFalse();
        HikariDataSource primary=(HikariDataSource)jdbc.getDataSource();
        URI address=URI.create(primary.getJdbcUrl().substring("jdbc:".length()));
        List<Connection> held=new ArrayList<>();
        try (Socket unauthenticated=new Socket(address.getHost(),address.getPort())) {
            unauthenticated.setSoTimeout(1000);
            ByteArrayOutputStream packet=new ByteArrayOutputStream();
            DataOutputStream startup=new DataOutputStream(packet);
            startup.writeInt(196608);
            startup.write(("user\0jumin_viewport_read\0database\0"+address.getPath().substring(1)+"\0\0")
                    .getBytes(StandardCharsets.UTF_8));
            DataOutputStream wire=new DataOutputStream(unauthenticated.getOutputStream());
            wire.writeInt(packet.size()+4);
            wire.write(packet.toByteArray());
            wire.flush();
            assertThat(unauthenticated.getInputStream().read()).isEqualTo('R');
            for(int index=0;index<3;index++) {
                held.add(db.jdbc().getDataSource().getConnection());
            }
            double observed=metrics.counter("parking.viewport.db","outcome","connection_server_pending").count();

            // when
            assertThatThrownBy(() -> db.read("version",ViewportDeadline.after(Duration.ofSeconds(2)),
                    read -> read.queryForObject("SELECT 1",Integer.class))).isInstanceOf(RuntimeException.class);
            for(Connection connection:held) {
                connection.close();
            }
            held.clear();
            long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(3);
            while(metrics.counter("parking.viewport.db","outcome","connection_server_pending").count()==observed) {
                assertThat(System.nanoTime()).isLessThan(until);
                Thread.sleep(10);
            }

            // then
            assertThat(metrics.get("parking.viewport.db.unknown").gauge().value()).isGreaterThan(0);
            assertThatThrownBy(() -> service.search(request(0,126.99,37.49,127.01,37.51)))
                    .isInstanceOf(ViewportUnavailableException.class);
        } finally {
            for(Connection connection:held) {
                connection.close();
            }
        }
        long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
        while(metrics.get("parking.viewport.db.unknown").gauge().value()!=0) {
            assertThat(System.nanoTime()).isLessThan(until);
            Thread.sleep(10);
        }
        try(ViewportBody body=service.search(request(0,126.99,37.49,127.01,37.51))) {
            assertThat(body.value()).isInstanceOf(ParkingLotViewportResponses.class);
            body.complete(true);
        }
    }

    @Test
    @DisplayName("세 실제 source query의 cache 쓰기가 모두 막혀도 DB worker는 metadata 조회를 처리한다")
    void cache_writes_do_not_occupy_real_database_workers() throws Exception {
        // given
        CountDownLatch writesStarted = new CountDownLatch(3);
        CountDownLatch releaseWrites = new CountDownLatch(1);
        NoViewportCellStore blockedStore = new NoViewportCellStore() {
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
        ViewportVersion version = versions.read();
        List<Long> cellIds = new ViewportCellCover(new ViewportSquareGrid(), properties)
                .cover(new ViewportBounds(126.99,37.49,127.01,37.51)).stream().limit(3).toList();
        assertThat(cellIds).hasSize(3);
        try (ViewportCellLoader loader = new ViewportCellLoader(blockedStore, repositoryForTest(), properties,
                new ViewportMetrics(metrics))) {
            try {
                for (long cellId : cellIds) {
                    ViewportCellKey key = new ViewportCellKey(properties.getEnvironment(),1,1,version,cellId);
                    assertThat(loader.resolve(List.of(key),Map.of(),ViewportDeadline.after(Duration.ofSeconds(2)),
                            new ViewportObservation(new ViewportMetrics(metrics)))).hasSize(1);
                }
                assertThat(writesStarted.await(5,TimeUnit.SECONDS)).isTrue();

                // when & then
                Integer value = db.read("version",ViewportDeadline.after(Duration.ofSeconds(1)),
                        read -> read.queryForObject("SELECT 1",Integer.class));
                assertThat(value).isEqualTo(1);
                assertThat(releaseWrites.getCount()).isEqualTo(1);
            } finally {
                releaseWrites.countDown();
            }
        }
    }

    private ViewportReadRepository repositoryForTest() {
        return new ViewportReadRepository(db, properties, new ViewportMetrics(metrics), spool);
    }

    @Test
    @DisplayName("실제 연결 종료 후 query와 rollback이 함께 실패해도 원래 SQL08과 미확정 lease를 기록한다")
    void quarantines_connection_failure_hidden_by_rollback() {
        // given
        double before = metrics.counter("parking.viewport.db", "outcome", "uncertain").count();

        // when & then
        assertThatThrownBy(() -> db.read("source", ViewportDeadline.after(Duration.ofSeconds(2)), read -> {
            int pid = read.execute((ConnectionCallback<Integer>) connection -> connection.unwrap(PGConnection.class).getBackendPID());
            assertThat(jdbc.queryForObject("SELECT pg_terminate_backend(?)", Boolean.class, pid)).isTrue();
            return read.queryForObject("SELECT 1", Integer.class);
        })).isInstanceOf(TransactionSystemException.class).satisfies(failure -> {
            assertThat(ViewportDbAccess.hasConnectionFailure(failure)).isTrue();
        });
        assertThat(metrics.counter("parking.viewport.db", "outcome", "uncertain").count()).isEqualTo(before + 1);
    }

    @Test
    @DisplayName("각 fetch가 statement timeout보다 빨라도 전체 cursor deadline 후에는 성공을 전달하지 않는다")
    void enforces_total_deadline_across_real_cursor_fetches() {
        // given
        ViewportDeadline deadline = ViewportDeadline.after(Duration.ofMillis(900));
        AtomicInteger consumed = new AtomicInteger();

        // when
        var future = db.readAsync("source", deadline, read -> read.execute((ConnectionCallback<Integer>) connection -> {
            try (PreparedStatement statement = connection.prepareStatement(
                    "SELECT value, pg_sleep(0.05) FROM generate_series(1, 80) AS values(value)")) {
                statement.setFetchSize(8);
                try (ResultSet rows = statement.executeQuery()) {
                    while (deadline.next(rows)) {
                        consumed.incrementAndGet();
                    }
                }
            }
            return consumed.get();
        }));

        // then
        assertThatThrownBy(() -> future.get(5, TimeUnit.SECONDS))
                .hasCauseInstanceOf(ViewportUnavailableException.class);
        assertThat(consumed.get()).isPositive().isLessThan(80);
        assertThat(deadline.remainingNanos()).isZero();
    }

    @Test
    @DisplayName("전체 응답 파일 생성 뒤 read-only commit 연결이 끊겨도 결과와 quota를 정리한다")
    void disposes_result_if_transaction_commit_fails() {
        // given
        properties.setMaxRequestBytes(320);
        AtomicBoolean cleaned = new AtomicBoolean();

        // when & then
        assertThatThrownBy(() -> db.read("fallback", ViewportDeadline.after(Duration.ofSeconds(2)), read -> {
            ViewportSpool.Builder builder = spool.builder();
            for (int index = 0; index < 10; index++) {
                builder.add(new ViewportItem(index, 37.5, 127, 50, false, true, false, false, false));
            }
            ViewportBody prepared = builder.build();
            read.execute((ConnectionCallback<Void>) connection -> {
                connection.unwrap(BaseConnection.class).close();
                return null;
            });
            return new ViewportBody(prepared.value(), () -> {
                prepared.close();
                cleaned.set(true);
            });
        })).isInstanceOf(RuntimeException.class);
        assertThat(cleaned).isTrue();
        assertThat(spool.reservedBytes()).isZero();
    }

    @BeforeEach
    void prepareFixture() {
        setDay("2026-10-26");
        properties.setGridSizeMeters(1000);
        properties.setMaxRequestBytes(4 * 1024 * 1024);
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            jdbc.update("""
                    UPDATE parking_viewport_cache_state SET dataset_epoch = ?, revision = 0,
                    projection_ready = FALSE, grid_size_meters = 1000 WHERE id = 1
                    """, UUID.randomUUID());
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
    @DisplayName("7요일과 8필터 조합에서 원본 JPA 조회와 cold 및 warm 캐시의 결과가 같다")
    void matches_original_for_every_day_and_filter() {
        // given
        for (int day = 0; day < 7; day++) {
            setDay(LocalDate.of(2026, 10, 26).plusDays(day).toString());
            for (int mask = 0; mask < 8; mask++) {
                ParkingLotViewportRequest request = request(mask, 126.995, 37.495, 127.005, 37.505);
                ParkingLotViewportResponses expected = legacy.searchViewport(request);

                // when & then
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
            assertThat(search(request)).as("random viewport %s", index).isEqualTo(legacy.searchViewport(request));
        }
    }

    @Test
    @DisplayName("warm 요청은 source SQL을 실행하지 않고 commit 뒤에는 새 revision의 값만 재사용한다")
    void invalidates_after_committed_source_change() {
        // given
        ParkingLotViewportRequest request = request(0, 126.99, 37.49, 127.01, 37.51);
        search(request);
        double before = counter("sql", "cell_batch");
        ViewportVersion version = versions.read();

        // when & then
        ParkingLotViewportResponses warm = search(request);
        assertThat(counter("sql", "cell_batch")).isEqualTo(before);
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            ViewportVersion ticket = writer.beforeSourceWrite();
            jdbc.update("UPDATE parking_lots SET capacity = 999 WHERE active = TRUE");
            writer.afterSourceWrite(ticket);
        });
        assertThat(versions.read().revision()).isEqualTo(version.revision() + 1);
        ParkingLotViewportResponses changed = search(request);
        assertThat(changed).isEqualTo(legacy.searchViewport(request)).isNotEqualTo(warm);
        assertThat(counter("sql", "cell_batch")).isGreaterThan(before);
    }

    @Test
    @DisplayName("서로 다른 작은 viewport도 같은 사각형 셀을 재사용해 source SQL을 추가하지 않는다")
    void reuses_square_cells_between_distinct_viewports() {
        ParkingLotViewportRequest first = request(0, 126.99999, 37.49999, 127.00001, 37.50001);
        ParkingLotViewportRequest second = request(0, 126.999991, 37.499991, 127.000011, 37.500011);
        ViewportCellCover cover = new ViewportCellCover(new ViewportSquareGrid(), properties);
        assertThat(cover.cover(ViewportBounds.from(first))).isNotEmpty()
                .isEqualTo(cover.cover(ViewportBounds.from(second)));
        double initial = counter("sql", "cell_batch");

        assertThat(search(first)).isEqualTo(legacy.searchViewport(first));
        double afterFirst = counter("sql", "cell_batch");
        assertThat(afterFirst).isGreaterThan(initial);
        assertThat(search(second)).isEqualTo(legacy.searchViewport(second));
        assertThat(counter("sql", "cell_batch")).isEqualTo(afterFirst);
    }

    @Test
    @DisplayName("좌표 이동을 commit하면 이전 셀과 새 셀의 warm 결과를 함께 무효화한다")
    void invalidates_old_and_new_square_cells_after_move() {
        ParkingLotViewportRequest oldArea = request(0, 127.0049, 37.4949, 127.0051, 37.4951);
        ParkingLotViewportRequest newArea = request(0, 127.0199, 37.5199, 127.0201, 37.5201);
        assertThat(search(oldArea).parkingLots()).extracting(row -> row.id()).contains(2L);
        assertThat(search(newArea).parkingLots()).extracting(row -> row.id()).doesNotContain(2L);
        long previousCell = jdbc.queryForObject("SELECT viewport_grid_cell FROM parking_lots WHERE id=2", Long.class);
        ViewportVersion before = versions.read();

        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            ViewportVersion ticket = writer.beforeSourceWrite();
            jdbc.update("UPDATE parking_lots SET latitude=37.52, longitude=127.02 WHERE id=2");
            writer.afterSourceWrite(ticket);
        });

        assertThat(versions.read().revision()).isEqualTo(before.revision() + 1);
        assertThat(jdbc.queryForObject("SELECT viewport_grid_cell FROM parking_lots WHERE id=2", Long.class))
                .isNotEqualTo(previousCell);
        ParkingLotViewportResponses oldResult = search(oldArea);
        ParkingLotViewportResponses newResult = search(newArea);
        assertThat(oldResult).isEqualTo(legacy.searchViewport(oldArea));
        assertThat(newResult).isEqualTo(legacy.searchViewport(newArea));
        assertThat(oldResult.parkingLots()).extracting(row -> row.id()).doesNotContain(2L);
        assertThat(newResult.parkingLots()).extracting(row -> row.id()).contains(2L);
    }

    @Test
    @DisplayName("그리드 크기 불일치는 원본으로 우회하고 prepare 뒤 새 크기의 셀만 재사용한다")
    void fences_old_grid_size_until_prepare() {
        ParkingLotViewportRequest request = request(0, 126.99, 37.49, 127.01, 37.51);
        search(request);
        ViewportVersion before = versions.read();
        try {
            properties.setGridSizeMeters(2000);
            double fallback = counter("sql", "fallback");
            assertThat(search(request)).isEqualTo(legacy.searchViewport(request));
            assertThat(counter("sql", "fallback")).isEqualTo(fallback + 1);

            ViewportVersion prepared = writer.prepare();
            assertThat(prepared.gridSizeMeters()).isEqualTo(2000);
            assertThat(prepared.revision()).isEqualTo(before.revision() + 1);
            assertThat(prepared.ready()).isTrue();
            assertThat(search(request)).isEqualTo(legacy.searchViewport(request));
            double source = counter("sql", "cell_batch");
            assertThat(search(request)).isEqualTo(legacy.searchViewport(request));
            assertThat(counter("sql", "cell_batch")).isEqualTo(source);
        } finally {
            properties.setGridSizeMeters(1000);
        }
    }

    @Test
    @DisplayName("TTL 전체 적중은 버전 SQL 없이 재사용하고 새 revision은 cold 셀에서도 조회한다")
    void ttl_full_hit_skips_version_sql_and_cold_load_accepts_new_revision() {
        withTtlMode(() -> {
            ParkingLotViewportRequest request = request(0, 126.99, 37.49, 127.01, 37.51);
            double versionQueries = counter("sql", "version");
            double sourceQueries = counter("sql", "cell_batch");
            ParkingLotViewportResponses initial = search(request);
            assertThat(initial).isEqualTo(legacy.searchViewport(request));
            awaitTtlStored(cellStore, request);
            double sourceAfterCold = counter("sql", "cell_batch");
            assertThat(sourceAfterCold).isGreaterThan(sourceQueries);

            assertThat(search(request)).isEqualTo(initial);
            assertThat(counter("sql", "cell_batch")).isEqualTo(sourceAfterCold);
            assertThat(counter("sql", "version")).isEqualTo(versionQueries);

            ViewportVersion before = versions.read();
            new TransactionTemplate(transactions).executeWithoutResult(status -> {
                ViewportVersion ticket = writer.beforeSourceWrite();
                jdbc.update("UPDATE parking_lots SET capacity = 999 WHERE active = TRUE");
                writer.afterSourceWrite(ticket);
            });
            assertThat(versions.read().revision()).isGreaterThan(before.revision());
            assertThat(search(request)).isEqualTo(initial).isNotEqualTo(legacy.searchViewport(request));
            assertThat(counter("sql", "cell_batch")).isEqualTo(sourceAfterCold);
            assertThat(counter("sql", "version")).isEqualTo(versionQueries);

            // A new namespace forces a cache miss without changing the actual database revision.
            properties.setEnvironment(ttlEnvironment());
            assertThat(search(request)).isEqualTo(legacy.searchViewport(request));
            assertThat(counter("sql", "cell_batch")).isGreaterThan(sourceAfterCold);
            assertThat(counter("sql", "version")).isEqualTo(versionQueries);
        });
    }

    @Test
    @DisplayName("TTL miss 중 state 부재와 준비 안 됨 및 grid 불일치는 재시도 없이 전체 원본으로 우회한다")
    void ttl_miss_falls_back_for_missing_or_unusable_projection_state() {
        withTtlMode(() -> {
            ParkingLotViewportRequest request = request(0, 126.99, 37.49, 127.01, 37.51);
            ParkingLotViewportResponses expected = legacy.searchViewport(request);
            ViewportVersion original = versions.read();
            for (String condition : List.of("missing", "not-ready", "wrong-grid")) {
                properties.setEnvironment(ttlEnvironment());
                try {
                    switch (condition) {
                        case "missing" -> jdbc.update("DELETE FROM parking_viewport_cache_state WHERE id = 1");
                        case "not-ready" -> jdbc.update("UPDATE parking_viewport_cache_state SET projection_ready = FALSE WHERE id = 1");
                        case "wrong-grid" -> jdbc.update("UPDATE parking_viewport_cache_state SET grid_size_meters = 2000 WHERE id = 1");
                        default -> throw new AssertionError(condition);
                    }
                    double versionsBefore = counter("sql", "version");
                    double sourcesBefore = counter("sql", "cell_batch");
                    double fallbacksBefore = counter("sql", "fallback");

                    assertThat(search(request)).as(condition).isEqualTo(expected);
                    assertThat(counter("sql", "version")).as(condition).isEqualTo(versionsBefore);
                    assertThat(counter("sql", "cell_batch")).as(condition).isEqualTo(sourcesBefore + 1);
                    assertThat(counter("sql", "fallback")).as(condition).isEqualTo(fallbacksBefore + 1);
                } finally {
                    jdbc.update("""
                            INSERT INTO parking_viewport_cache_state
                                (id, dataset_epoch, revision, grid_size_meters, projection_ready)
                            VALUES (1, ?, ?, ?, ?)
                            ON CONFLICT (id) DO UPDATE SET dataset_epoch = EXCLUDED.dataset_epoch,
                                revision = EXCLUDED.revision, grid_size_meters = EXCLUDED.grid_size_meters,
                                projection_ready = EXCLUDED.projection_ready
                            """, original.epoch(), original.revision(), original.gridSizeMeters(), original.ready());
                }
            }
        });
    }

    @Test
    @DisplayName("TTL 모드에서 이동 뒤에는 이전 셀과 빈 새 셀이 만료까지 남고 만료 뒤 원본과 같아진다")
    void ttl_mode_keeps_stale_old_and_new_cells_until_expiry_after_move() {
        withTtlMode(() -> {
            AtomicLong ticker = new AtomicLong();
            ViewportMetrics isolatedMetrics = new ViewportMetrics(new SimpleMeterRegistry());
            ViewportCellCover cover = new ViewportCellCover(new ViewportSquareGrid(), properties);
            ViewportReadRepository repository = new ViewportReadRepository(db, properties, isolatedMetrics, spool);
            try (CaffeineViewportCellStore store = new CaffeineViewportCellStore(properties,
                         new ViewportCellCodec(properties.getMaxValueBytes(), properties.getMaxCellRows()),
                         isolatedMetrics, ticker::get, () -> 0.5);
                 ViewportCellLoader loader = new ViewportCellLoader(store, repository, properties, isolatedMetrics)) {
                ViewportSearchService ttlService = new ViewportSearchService(properties, legacy, cover, repository,
                        store, loader, isolatedMetrics, new ParkingLodScoreCalculator(), clock);
                ParkingLotViewportRequest oldArea = request(0, 127.0049, 37.4949, 127.0051, 37.4951);
                ParkingLotViewportRequest newArea = request(0, 127.0199, 37.5199, 127.0201, 37.5201);
                assertThat(search(ttlService, oldArea).parkingLots()).extracting(row -> row.id()).contains(2L);
                assertThat(search(ttlService, newArea).parkingLots()).extracting(row -> row.id()).doesNotContain(2L);
                awaitTtlStored(store, oldArea);
                awaitTtlStored(store, newArea);
                awaitFlightsCleared(isolatedMetrics);

                new TransactionTemplate(transactions).executeWithoutResult(status -> {
                    ViewportVersion ticket = writer.beforeSourceWrite();
                    jdbc.update("UPDATE parking_lots SET latitude=37.52, longitude=127.02 WHERE id=2");
                    writer.afterSourceWrite(ticket);
                });
                assertThat(legacy.searchViewport(oldArea).parkingLots()).extracting(row -> row.id()).doesNotContain(2L);
                assertThat(legacy.searchViewport(newArea).parkingLots()).extracting(row -> row.id()).contains(2L);
                assertThat(search(ttlService, oldArea).parkingLots()).extracting(row -> row.id()).contains(2L);
                assertThat(search(ttlService, newArea).parkingLots()).extracting(row -> row.id()).doesNotContain(2L);

                ticker.set(Duration.ofMinutes(20).toNanos());
                assertThat(search(ttlService, oldArea)).isEqualTo(legacy.searchViewport(oldArea));
                assertThat(search(ttlService, newArea)).isEqualTo(legacy.searchViewport(newArea));
            }
        });
    }

    @Test
    @DisplayName("normal prepare는 warm epoch를 유지하고 fencing 후 prepare는 epoch를 새로 만든다")
    void distinguishes_ready_prepare_and_fenced_activation() {
        // given
        ViewportVersion initial = versions.read();

        // when & then
        assertThat(writer.prepare()).isEqualTo(initial);
        jdbc.update("UPDATE parking_viewport_cache_state SET projection_ready = FALSE");
        ViewportVersion activated = writer.prepare();
        assertThat(activated.epoch()).isNotEqualTo(initial.epoch());
        assertThat(activated.ready()).isTrue();
    }

    @Test
    @DisplayName("캐시 범위 밖 전체 조회는 메모리 예산 초과 시에도 전체 JSON을 반환한다")
    void falls_back_with_complete_spooled_json() throws Exception {
        // given
        properties.setMaxRequestBytes(320);
        ParkingLotViewportRequest request = request(0, 126.5, 37, 127.5, 38);
        ParkingLotViewportResponses expected = legacy.searchViewport(request);

        // when
        try (ViewportBody body = service.search(request)) {
            Resource resource = (Resource) body.value();
            ParkingLotViewportResponses actual;
            try (var input = resource.getInputStream()) {
                actual = new ObjectMapper().readValue(input, ParkingLotViewportResponses.class);
            }

            // then
            assertThat(actual).isEqualTo(expected);
            assertThat(actual.totalCount()).isGreaterThan(100);
            body.complete(true);
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

    private void withTtlMode(Runnable test) {
        String previousEnvironment = properties.getEnvironment();
        boolean previousVersionCheck = properties.isVersionCheckEnabled();
        try {
            properties.setEnvironment(ttlEnvironment());
            properties.setVersionCheckEnabled(false);
            test.run();
        } finally {
            properties.setVersionCheckEnabled(previousVersionCheck);
            properties.setEnvironment(previousEnvironment);
        }
    }

    private String ttlEnvironment() {
        return "ttl_" + UUID.randomUUID().toString().replace("-", "");
    }

    private void awaitTtlStored(ViewportCellStore store, ParkingLotViewportRequest request) {
        List<ViewportCellKey> keys = new ViewportCellCover(new ViewportSquareGrid(), properties)
                .cover(ViewportBounds.from(request)).stream()
                .map(cell -> ViewportCellKey.ttlOnly(properties.getEnvironment(), properties.getSchema(),
                        properties.getPolicy(), properties.getGridSizeMeters(), cell))
                .toList();
        assertThat(keys).isNotEmpty();
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < until) {
            if (store.getMany(keys, ViewportDeadline.after(Duration.ofSeconds(2))).size() == keys.size()) {
                return;
            }
            try {
                Thread.sleep(10);
            } catch (InterruptedException failure) {
                Thread.currentThread().interrupt();
                throw new AssertionError("TTL cache 저장을 기다리다 중단되었습니다.", failure);
            }
        }
        assertThat(store.getMany(keys, ViewportDeadline.after(Duration.ofSeconds(2))))
                .as("all requested TTL cells must have completed their asynchronous writes")
                .containsOnlyKeys(keys.toArray(ViewportCellKey[]::new));
    }

    private void awaitFlightsCleared(ViewportMetrics targetMetrics) {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < until) {
            if (targetMetrics.registry().get("parking.viewport.loader.flights").gauge().value() == 0) {
                return;
            }
            try {
                Thread.sleep(10);
            } catch (InterruptedException failure) {
                Thread.currentThread().interrupt();
                throw new AssertionError("공유 작업 정리를 기다리다 중단되었습니다.", failure);
            }
        }
        assertThat(targetMetrics.registry().get("parking.viewport.loader.flights").gauge().value()).isZero();
    }

    private ParkingLotViewportResponses search(ParkingLotViewportRequest request) {
        return search(service, request);
    }

    private ParkingLotViewportResponses search(ViewportSearchService target, ParkingLotViewportRequest request) {
        try (ViewportBody body = target.search(request)) {
            ParkingLotViewportResponses value = (ParkingLotViewportResponses) body.value();
            body.complete(true);
            return value;
        }
    }

    private double counter(String name, String outcome) {
        return metrics.counter("parking.viewport." + name, "outcome", outcome).count();
    }

    private void setDay(String day) {
        when(clock.instant()).thenReturn(Instant.parse(day + "T01:00:00Z"));
        when(clock.getZone()).thenReturn(ZoneId.of("Asia/Seoul"));
    }

    private static Boolean tri(int value) {
        return switch (value % 3) { case 0 -> null; case 1 -> false; default -> true; };
    }

    private static ParkingLotViewportRequest request(int mask, double west, double south, double east, double north) {
        return new ParkingLotViewportRequest(west, south, east, north, (mask & 1) != 0, (mask & 2) != 0, (mask & 4) != 0);
    }
}
