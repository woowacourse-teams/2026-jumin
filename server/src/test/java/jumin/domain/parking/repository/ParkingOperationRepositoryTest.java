package jumin.domain.parking.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import jumin.TestcontainersConfiguration;
import jumin.domain.parking.entity.ParkingOperation;
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
class ParkingOperationRepositoryTest {

    @Autowired
    private ParkingOperationRepository parkingOperationRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("주차장 ID 목록으로 운영정보를 한 번에 조회한다")
    void finds_operations_by_parking_lot_ids() {
        // given
        long parkingLotId = insertParkingLot();
        jdbcTemplate.update("""
                insert into parking_operations (
                    parking_lot_id, base_minutes, base_fee,
                    source_checked_at, created_at, updated_at
                ) values (?, 30, 1000, current_timestamp, current_timestamp, current_timestamp)
                """, parkingLotId);

        // when
        List<ParkingOperation> results = parkingOperationRepository
                .findAllByParkingLotIdIn(List.of(parkingLotId));

        // then
        assertThat(results).hasSize(1);
        assertThat(results.getFirst().getParkingLotId()).isEqualTo(parkingLotId);
    }

    private long insertParkingLot() {
        jdbcTemplate.update("""
                insert into parking_lots (
                    source, source_external_id, name, address, latitude, longitude,
                    active, source_checked_at, created_at, updated_at
                ) values (
                    'DATA_GO_KR', 'operation-repository-test', '테스트 주차장', '서울시 테스트 주소',
                    37.4981, 127.0279, true,
                    current_timestamp, current_timestamp, current_timestamp
                )
                """);
        return jdbcTemplate.queryForObject("select max(id) from parking_lots", Long.class);
    }
}
