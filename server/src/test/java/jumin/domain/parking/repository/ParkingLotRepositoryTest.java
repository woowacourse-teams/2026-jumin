package jumin.domain.parking.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import jumin.TestcontainersConfiguration;
import jumin.domain.parking.entity.ParkingLot;
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
@Import(TestcontainersConfiguration.class)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(FlywayAutoConfiguration.class)
class ParkingLotRepositoryTest {

    @Autowired
    private ParkingLotRepository parkingLotRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("반경 600m 이내의 활성 주차장만 조회한다")
    void finds_only_parking_lots_within_radius() {
        // given
        insertParkingLot("near", "가까운 주차장", "서울시 테스트 주소", true, 37.4990, 127.0279);
        insertParkingLot("far", "먼 주차장", "서울시 테스트 주소", true, 37.5050, 127.0279);
        insertParkingLot("inactive", "비활성 주차장", "서울시 테스트 주소", false, 37.4990, 127.0279);
        insertParkingLot("missing-location", "위치 없는 주차장", "서울시 테스트 주소", true, null, null);
        insertParkingLot("missing-address", "주소 없는 주차장", null, true, 37.4990, 127.0279);

        // when
        List<ParkingLot> results = parkingLotRepository.findActiveWithinRadius(37.4981, 127.0279, 600);

        // then
        assertThat(results).extracting("name").containsExactly("가까운 주차장");
    }

    @Test
    @DisplayName("ID로 활성 상태이며 위치 정보가 있는 주차장만 조회한다")
    void finds_only_active_parking_lot_with_location_by_id() {
        // given
        insertParkingLot("active", "활성 주차장", "서울시 테스트 주소", true, 37.4990, 127.0279);
        insertParkingLot("inactive", "비활성 주차장", "서울시 테스트 주소", false, 37.4990, 127.0279);
        insertParkingLot("missing-location", "위치 없는 주차장", "서울시 테스트 주소", true, null, null);
        Long activeId = parkingLotId("active");
        Long inactiveId = parkingLotId("inactive");
        Long missingLocationId = parkingLotId("missing-location");

        // when & then
        assertThat(parkingLotRepository.findActiveWithLocationById(activeId)).isPresent();
        assertThat(parkingLotRepository.findActiveWithLocationById(inactiveId)).isEmpty();
        assertThat(parkingLotRepository.findActiveWithLocationById(missingLocationId)).isEmpty();
    }

    @Test
    @DisplayName("반경 경계 안쪽은 포함하고 바깥쪽은 제외한다")
    void respects_radius_boundary() {
        // given
        double destinationLatitude = 37.4981;
        double latitudePerMeter = Math.toDegrees(1 / 6_370_986.0);
        insertParkingLot(
                "inside-boundary",
                "경계 안쪽 주차장",
                "서울시 테스트 주소",
                true,
                destinationLatitude + latitudePerMeter * 599,
                127.0279
        );
        insertParkingLot(
                "outside-boundary",
                "경계 바깥 주차장",
                "서울시 테스트 주소",
                true,
                destinationLatitude + latitudePerMeter * 601,
                127.0279
        );

        // when
        List<ParkingLot> results = parkingLotRepository.findActiveWithinRadius(
                destinationLatitude,
                127.0279,
                600
        );

        // then
        assertThat(results).extracting("name").containsExactly("경계 안쪽 주차장");
    }

    private void insertParkingLot(
            String externalId,
            String name,
            String address,
            boolean active,
            Double latitude,
            Double longitude
    ) {
        jdbcTemplate.update("""
                insert into parking_lots (
                    source, source_external_id, name, address, latitude, longitude,
                    active, source_checked_at, created_at, updated_at
                ) values (
                    'DATA_GO_KR', ?, ?, ?, ?, ?,
                    ?, current_timestamp, current_timestamp, current_timestamp
                )
                """, externalId, name, address, latitude, longitude, active);
    }

    private Long parkingLotId(String externalId) {
        return jdbcTemplate.queryForObject(
                "select id from parking_lots where source_external_id = ?",
                Long.class,
                externalId
        );
    }
}
