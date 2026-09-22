package jumin.domain.walking.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import java.util.List;
import jumin.TestcontainersConfiguration;
import jumin.domain.walking.dto.WalkingDistanceQueryResult;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@DataJpaTest
@ActiveProfiles("test")
@Import({TestcontainersConfiguration.class, WalkingDistanceRepository.class})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(FlywayAutoConfiguration.class)
class WalkingDistanceRepositoryTest {

    @Autowired
    private WalkingDistanceRepository walkingDistanceRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("Flyway가 pgRouting을 활성화해도 보행망 적재 전에는 사용할 수 없다")
    void requires_import_after_extension_migration() {
        assertThat(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgrouting')",
                Boolean.class
        )).isTrue();
        assertThat(walkingDistanceRepository.hasUsableNetwork()).isFalse();
    }

    @Test
    @DisplayName("단절된 가장 가까운 노드 대신 연결된 주변 노드를 경유해 최단 도보거리를 계산한다")
    void finds_distances_through_connected_nearby_nodes() {
        // given
        insertWalkingGraph();
        long nearParkingLotId = insertParkingLot("near-walking-network");
        long farParkingLotId = insertParkingLot("far-walking-network");

        // when
        List<WalkingDistanceQueryResult> results = walkingDistanceRepository.findDistances(
                37.4981,
                127.0279,
                List.of(nearParkingLotId, farParkingLotId),
                100
        );

        // then
        assertThat(walkingDistanceRepository.hasUsableNetwork()).isTrue();
        assertThat(results)
                .extracting(WalkingDistanceQueryResult::parkingLotId, WalkingDistanceQueryResult::distanceMeters)
                .containsExactlyInAnyOrder(
                        tuple(nearParkingLotId, 26),
                        tuple(farParkingLotId, 709)
                );
    }

    private void insertWalkingGraph() {
        jdbcTemplate.update("""
                insert into walking_nodes (id, node_type_code, geom) values
                    (1, 'DESTINATION', ST_SetSRID(ST_MakePoint(127.0279, 37.4981), 4326)),
                    (2, 'INTERSECTION', ST_SetSRID(ST_MakePoint(127.0280, 37.4981), 4326)),
                    (3, 'PARKING', ST_SetSRID(ST_MakePoint(127.0282, 37.4981), 4326)),
                    (4, 'PARKING', ST_SetSRID(ST_MakePoint(127.0360, 37.4981), 4326)),
                    (5, 'DETACHED', ST_SetSRID(ST_MakePoint(127.02819, 37.4981), 4326)),
                    (6, 'DETACHED', ST_SetSRID(ST_MakePoint(127.02818, 37.4981), 4326))
                """);
        jdbcTemplate.update("""
                insert into walking_edges (id, source, target, geom, cost, reverse_cost) values
                    (1, 1, 2, ST_GeomFromText('LINESTRING (127.0279 37.4981, 127.0280 37.4981)', 4326), 10, 10),
                    (2, 2, 3, ST_GeomFromText('LINESTRING (127.0280 37.4981, 127.0282 37.4981)', 4326), 20, 20),
                    (3, 2, 4, ST_GeomFromText('LINESTRING (127.0280 37.4981, 127.0360 37.4981)', 4326), 700, 700),
                    (4, 5, 6, ST_GeomFromText('LINESTRING (127.02819 37.4981, 127.02818 37.4981)', 4326), 1, 1)
                """);
        jdbcTemplate.update("""
                insert into walking_network_metadata (
                    id, status, source, source_row_count, node_count, edge_count, imported_at
                ) values (1, 'READY', 'TEST', 10, 6, 4, current_timestamp)
                """);
    }

    private long insertParkingLot(String externalId) {
        double longitude = externalId.equals("near-walking-network") ? 127.02819 : 127.0360;
        jdbcTemplate.update("""
                insert into parking_lots (
                    source, source_external_id, name, address, latitude, longitude,
                    active, source_checked_at, created_at, updated_at
                ) values (
                    'DATA_GO_KR', ?, ?, '서울시 테스트 주소',
                    37.4981, ?,
                    true, current_timestamp, current_timestamp, current_timestamp
                )
                """, externalId, externalId, longitude);
        return jdbcTemplate.queryForObject(
                "select id from parking_lots where source_external_id = ?",
                Long.class,
                externalId
        );
    }
}
