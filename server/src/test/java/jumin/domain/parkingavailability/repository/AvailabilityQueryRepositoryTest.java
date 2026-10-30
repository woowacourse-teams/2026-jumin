package jumin.domain.parkingavailability.repository;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.Optional;
import jumin.TestcontainersConfiguration;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parkingavailability.dto.AvailabilityObservation;
import jumin.domain.parkingavailability.entity.AvailabilityProvider;
import jumin.domain.parkingavailability.entity.ParkingAvailability;
import jumin.domain.parkingavailability.entity.ParkingAvailabilityMapping;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
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
@Import({TestcontainersConfiguration.class, AvailabilityQueryRepository.class})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(FlywayAutoConfiguration.class)
class AvailabilityQueryRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-10-29T03:00:00Z");

    @Autowired
    private AvailabilityQueryRepository repository;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private JdbcTemplate jdbc;

    @ParameterizedTest
    @EnumSource(AvailabilityProvider.class)
    @DisplayName("활성 주차장과 유효한 제공기관 매핑에 연결된 현재값을 조회한다")
    void finds_current_availability_for_valid_provider_mapping(AvailabilityProvider provider) {
        // given
        long id = mappedCurrent("테스트 주차장", provider, "P01");

        // when
        Optional<ParkingAvailability> result = repository.findCurrentByParkingLotId(id);

        // then
        assertThat(result).isPresent();
        assertThat(result.orElseThrow().getParkingLotId()).isEqualTo(id);
        assertThat(result.orElseThrow().getProvider()).isEqualTo(provider);
        assertThat(result.orElseThrow().getExternalId()).isEqualTo("P01");
        assertThat(result.orElseThrow().getAvailable()).isEqualTo(8);
    }

    @Test
    @DisplayName("주차장 이름과 주소의 앞뒤 공백은 매핑 유효성에 영향을 주지 않는다")
    void matches_trimmed_parking_name_and_address() {
        // given
        long id = mappedCurrent("테스트 주차장", AvailabilityProvider.SEOUL, "S01");
        jdbc.update("""
                update parking_lots set name = '  테스트 주차장  ', address = '  서울 테스트 주소  '
                where id = ?
                """, id);
        entityManager.clear();

        // when
        Optional<ParkingAvailability> result = repository.findCurrentByParkingLotId(id);

        // then
        assertThat(result).isPresent();
        assertThat(result.orElseThrow().getAvailable()).isEqualTo(8);
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {
            "delete from parking_availability_mappings where parking_lot_id = ?",
            "update parking_availability_mappings set provider = 'BUSAN' where parking_lot_id = ?",
            "update parking_availability_mappings set external_id = 'S02' where parking_lot_id = ?",
            "update parking_lots set name = '다른 주차장' where id = ?",
            "update parking_lots set address = '다른 주소' where id = ?",
            "update parking_lots set address = null where id = ?",
            "update parking_lots set active = false where id = ?"
    })
    @DisplayName("매핑이나 주차장 정보가 달라지면 남아 있는 현재값을 노출하지 않는다")
    void excludes_current_availability_after_mapping_or_parking_identity_changes(String change) {
        // given
        long id = mappedCurrent("테스트 주차장", AvailabilityProvider.SEOUL, "S01");
        jdbc.update(change, id);
        entityManager.clear();

        // when
        Optional<ParkingAvailability> result = repository.findCurrentByParkingLotId(id);

        // then
        assertThat(result).isEmpty();
        assertThat(jdbc.queryForObject(
                "select count(*) from parking_availability where parking_lot_id = ?", Integer.class, id
        )).isEqualTo(1);
    }

    @Test
    @DisplayName("같은 제공기관과 외부 ID의 매핑이 다른 주차장으로 이동하면 기존 현재값을 노출하지 않는다")
    void excludes_current_availability_when_mapping_moves_to_another_parking_lot() {
        // given
        long oldId = mappedCurrent("이전 주차장", AvailabilityProvider.SEOUL, "S01");
        long newId = insertLot("새 주차장");
        jdbc.update("""
                update parking_availability_mappings set parking_lot_id = ?, expected_name = '새 주차장'
                where parking_lot_id = ?
                """, newId, oldId);
        entityManager.clear();

        // when
        Optional<ParkingAvailability> previous = repository.findCurrentByParkingLotId(oldId);
        Optional<ParkingAvailability> replacement = repository.findCurrentByParkingLotId(newId);

        // then
        assertThat(previous).isEmpty();
        assertThat(replacement).isEmpty();
    }

    @Test
    @DisplayName("유효한 매핑이 있어도 수집된 현재값이 없으면 빈 결과를 반환한다")
    void returns_empty_when_current_availability_is_missing() {
        // given
        long id = mappedCurrent("테스트 주차장", AvailabilityProvider.SEOUL, "S01");
        jdbc.update("delete from parking_availability where parking_lot_id = ?", id);
        entityManager.clear();

        // when
        Optional<ParkingAvailability> result = repository.findCurrentByParkingLotId(id);

        // then
        assertThat(result).isEmpty();
    }

    private long mappedCurrent(String name, AvailabilityProvider provider, String externalId) {
        long id = insertLot(name);
        ParkingLot parkingLot = entityManager.find(ParkingLot.class, id);
        entityManager.persist(new ParkingAvailabilityMapping(parkingLot, provider, externalId));
        AvailabilityObservation observation = new AvailabilityObservation(
                provider, externalId, null, null, 100, 92, 8, NOW, NOW
        );
        entityManager.persist(new ParkingAvailability(id, observation));
        entityManager.flush();
        entityManager.clear();
        return id;
    }

    private long insertLot(String name) {
        return jdbc.queryForObject("""
                insert into parking_lots (source, source_external_id, name, address, source_checked_at,
                    created_at, updated_at)
                values ('DATA_GO_KR', ?, ?, '서울 테스트 주소', now(), now(), now()) returning id
                """, Long.class, name, name);
    }
}
