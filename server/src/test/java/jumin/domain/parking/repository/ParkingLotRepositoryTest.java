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
        insertParkingLot("near", "가까운 주차장", 37.4990, 127.0279);
        insertParkingLot("far", "먼 주차장", 37.5050, 127.0279);

        // when
        List<ParkingLot> results = parkingLotRepository.findActiveWithinRadius(37.4981, 127.0279, 600);

        // then
        assertThat(results).extracting("name").containsExactly("가까운 주차장");
    }

    private void insertParkingLot(String externalId, String name, double latitude, double longitude) {
        jdbcTemplate.update("""
                insert into parking_lots (
                    source, source_external_id, name, address, latitude, longitude,
                    active, source_checked_at, created_at, updated_at
                ) values (
                    'DATA_GO_KR', ?, ?, '서울시 테스트 주소', ?, ?,
                    true, current_timestamp, current_timestamp, current_timestamp
                )
                """, externalId, name, latitude, longitude);
    }
}
