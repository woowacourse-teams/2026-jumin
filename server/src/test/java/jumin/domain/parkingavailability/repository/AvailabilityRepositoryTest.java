package jumin.domain.parkingavailability.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import jumin.TestcontainersConfiguration;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parkingavailability.dto.AvailabilityObservation;
import jumin.domain.parkingavailability.entity.AvailabilityProvider;
import jumin.domain.parkingavailability.entity.ParkingAvailability;
import jumin.domain.parkingavailability.entity.ParkingAvailabilityMapping;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@DataJpaTest
@ActiveProfiles("test")
@Import({TestcontainersConfiguration.class, AvailabilityRepository.class})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(FlywayAutoConfiguration.class)
class AvailabilityRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-10-23T06:00:00Z");

    @Autowired
    private AvailabilityRepository repository;
    @Autowired
    private EntityManager entityManager;
    @Autowired
    private JdbcTemplate jdbc;

    @Test
    @DisplayName("검증된 서울·부산 매핑의 현재값과 주차장에 직접 연결된 이력을 저장한다")
    void stores_current_and_history_for_verified_mappings() {
        // given
        long seoul = map("서울 주차장", AvailabilityProvider.SEOUL, "S01");
        long busan = map("부산 주차장", AvailabilityProvider.BUSAN, "B01");

        // when
        int saved = repository.saveAll(List.of(
                observation(AvailabilityProvider.SEOUL, "S01", NOW, NOW, 12),
                observation(AvailabilityProvider.BUSAN, "B01", NOW, NOW, 8)));
        entityManager.clear();

        // then
        assertThat(saved).isEqualTo(2);
        assertThat(current(seoul).getParkingLotId()).isEqualTo(seoul);
        assertThat(current(busan).getParkingLotId()).isEqualTo(busan);
        assertThat(current(seoul).getAvailable()).isEqualTo(12);
        assertThat(current(busan).getAvailable()).isEqualTo(8);
        assertThat(jdbc.queryForList("select parking_lot_id from parking_availability_history", Long.class))
                .containsExactlyInAnyOrder(seoul, busan);
        assertThat(historyCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("같은 원천 시각·수치의 반복 응답은 이력을 늘리지 않고 현재 수집시각만 갱신한다")
    void deduplicates_observations_and_refreshes_current_fetch_time() {
        // given
        long id = map("반복 관측", AvailabilityProvider.SEOUL, "S01");
        repository.saveAll(List.of(observation(AvailabilityProvider.SEOUL, "S01", NOW, NOW, 12)));

        // when
        int saved = repository.saveAll(List.of(
                observation(AvailabilityProvider.SEOUL, "S01", NOW, NOW.plusSeconds(300), 12)));

        // then
        assertThat(saved).isZero();
        assertThat(historyCount()).isEqualTo(1);
        assertThat(current(id).getFetchedAt()).isEqualTo(NOW.plusSeconds(300));
    }

    @Test
    @DisplayName("나중에 도착한 과거 원천값은 이력에 보존하고 현재 여석을 되돌리지 않는다")
    void stores_late_source_history_without_regressing_current() {
        // given
        long id = map("과거 원천", AvailabilityProvider.SEOUL, "S01");
        repository.saveAll(List.of(observation(AvailabilityProvider.SEOUL, "S01", NOW, NOW, 12)));

        // when
        repository.saveAll(List.of(
                observation(AvailabilityProvider.SEOUL, "S01", NOW.minusSeconds(300), NOW.plusSeconds(300), 22)));

        // then
        assertThat(historyCount()).isEqualTo(2);
        assertThat(current(id).getAvailable()).isEqualTo(12);
        assertThat(current(id).getSourceUpdatedAt()).isEqualTo(NOW);
        assertThat(current(id).getFetchedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("원천 시각이 같은 수치 정정과 이전 수치로 돌아오는 정정도 별도로 보존한다")
    void stores_corrected_counts_with_the_same_source_time() {
        // given
        long id = map("정정 관측", AvailabilityProvider.SEOUL, "S01");
        repository.saveAll(List.of(observation(AvailabilityProvider.SEOUL, "S01", NOW, NOW, 12)));

        // when
        repository.saveAll(List.of(observation(AvailabilityProvider.SEOUL, "S01", NOW, NOW.plusSeconds(300), 9)));
        repository.saveAll(List.of(observation(AvailabilityProvider.SEOUL, "S01", NOW, NOW.plusSeconds(600), 12)));

        // then
        assertThat(historyCount()).isEqualTo(3);
        assertThat(current(id).getAvailable()).isEqualTo(12);
    }

    @Test
    @DisplayName("원천 시각이 없으면 직전 수치가 바뀔 때 저장하고 이전 수치로 돌아오는 변화도 보존한다")
    void stores_undated_count_changes_including_a_return_to_previous_counts() {
        // given
        long id = map("원천 시각 없음", AvailabilityProvider.SEOUL, "S01");
        repository.saveAll(List.of(observation(AvailabilityProvider.SEOUL, "S01", null, NOW, 12)));
        repository.saveAll(List.of(observation(AvailabilityProvider.SEOUL, "S01", null, NOW.plusSeconds(300), 12)));

        // when
        repository.saveAll(List.of(observation(AvailabilityProvider.SEOUL, "S01", null, NOW.plusSeconds(600), 8)));
        repository.saveAll(List.of(observation(AvailabilityProvider.SEOUL, "S01", null, NOW.plusSeconds(900), 12)));

        // then
        assertThat(historyCount()).isEqualTo(3);
        assertThat(current(id).getAvailable()).isEqualTo(12);
        assertThat(current(id).getFetchedAt()).isEqualTo(NOW.plusSeconds(900));
    }

    @Test
    @DisplayName("시각 없는 응답이 도착한 뒤에도 과거 원천값이 현재값을 되돌리지 않는다")
    void preserves_known_source_order_after_an_undated_observation() {
        // given
        long id = map("원천 시각 누락 후 복구", AvailabilityProvider.SEOUL, "S01");
        repository.saveAll(List.of(observation(AvailabilityProvider.SEOUL, "S01", NOW, NOW, 12)));
        repository.saveAll(List.of(observation(AvailabilityProvider.SEOUL, "S01", null, NOW.plusSeconds(300), 15)));

        // when
        repository.saveAll(List.of(observation(AvailabilityProvider.SEOUL, "S01",
                NOW.minusSeconds(300), NOW.plusSeconds(600), 22)));

        // then
        assertThat(current(id).getAvailable()).isEqualTo(15);
        assertThat(current(id).getSourceUpdatedAt()).isNull();
        assertThat(current(id).getFetchedAt()).isEqualTo(NOW.plusSeconds(300));
        assertThat(historyCount()).isEqualTo(3);
    }

    @Test
    @DisplayName("미매핑·비활성·이름과 주소가 바뀐 주차장은 저장하지 않는다")
    void skips_unmapped_inactive_and_changed_identities() {
        // given
        long renamed = map("이름 변경", AvailabilityProvider.SEOUL, "renamed");
        long moved = map("주소 변경", AvailabilityProvider.SEOUL, "moved");
        long inactive = map("비활성", AvailabilityProvider.SEOUL, "inactive");
        jdbc.update("update parking_lots set name = '다른 주차장' where id = ?", renamed);
        jdbc.update("update parking_lots set address = '다른 주소' where id = ?", moved);
        jdbc.update("update parking_lots set active = false where id = ?", inactive);

        // when
        int saved = repository.saveAll(List.of(
                observation(AvailabilityProvider.SEOUL, "renamed", NOW, NOW, 12),
                observation(AvailabilityProvider.SEOUL, "moved", NOW, NOW, 12),
                observation(AvailabilityProvider.SEOUL, "inactive", NOW, NOW, 12),
                observation(AvailabilityProvider.SEOUL, "unmapped", NOW, NOW, 12)));

        // then
        assertThat(saved).isZero();
        assertThat(historyCount()).isZero();
        assertThat(jdbc.queryForObject("select count(*) from parking_availability", Integer.class)).isZero();
    }

    @Test
    @DisplayName("결측·음수·대수 불일치·잘못된 미래 시각은 현재값과 이력에 저장하지 않는다")
    void skips_invalid_counts_and_future_source_time() {
        // given
        map("잘못된 원천", AvailabilityProvider.SEOUL, "S01");

        // when
        int saved = repository.saveAll(List.of(
                observation(AvailabilityProvider.SEOUL, "S01", NOW, NOW, -1),
                new AvailabilityObservation(AvailabilityProvider.SEOUL, "S01", null, null,
                        100, 88, null, NOW, NOW),
                new AvailabilityObservation(AvailabilityProvider.SEOUL, "S01", null, null,
                        100, 88, 11, NOW, NOW),
                observation(AvailabilityProvider.SEOUL, "S01", NOW.plusSeconds(121), NOW, 12)));

        // then
        assertThat(saved).isZero();
        assertThat(historyCount()).isZero();
    }

    @Test
    @DisplayName("같은 제공기관의 외부 주차장 하나를 두 내부 주차장에 연결할 수 없다")
    void prevents_one_external_source_from_mapping_to_multiple_parking_lots() {
        // given
        map("첫 주차장", AvailabilityProvider.SEOUL, "S01");
        long second = insertLot("둘째 주차장");

        // when & then
        assertThatThrownBy(() -> jdbc.update("""
                insert into parking_availability_mappings
                    (parking_lot_id, provider, external_id, expected_name, expected_address)
                values (?, 'SEOUL', 'S01', '둘째 주차장', '서울 테스트 주소')
                """, second)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("현재값을 삭제해도 주차장에 직접 연결된 이력은 유지된다")
    void preserves_history_independently_of_current_availability() {
        // given
        map("이력 보존", AvailabilityProvider.SEOUL, "S01");
        repository.saveAll(List.of(observation(AvailabilityProvider.SEOUL, "S01", NOW, NOW, 12)));

        // when
        jdbc.update("delete from parking_availability");

        // then
        assertThat(historyCount()).isEqualTo(1);
    }

    private long map(String name, AvailabilityProvider provider, String externalId) {
        long id = insertLot(name);
        ParkingLot parkingLot = entityManager.find(ParkingLot.class, id);
        entityManager.persist(new ParkingAvailabilityMapping(parkingLot, provider, externalId));
        entityManager.flush();
        return id;
    }

    private long insertLot(String name) {
        return jdbc.queryForObject("""
                insert into parking_lots (source, source_external_id, name, address, source_checked_at,
                    created_at, updated_at)
                values ('DATA_GO_KR', ?, ?, '서울 테스트 주소', now(), now(), now()) returning id
                """, Long.class, name, name);
    }

    private ParkingAvailability current(long id) {
        return entityManager.find(ParkingAvailability.class, id);
    }

    private long historyCount() {
        return jdbc.queryForObject("select count(*) from parking_availability_history", Long.class);
    }

    private AvailabilityObservation observation(AvailabilityProvider provider, String externalId,
                                                Instant sourceTime, Instant fetchedAt, int available) {
        return new AvailabilityObservation(provider, externalId, null, null,
                100, 100 - available, available, sourceTime, fetchedAt);
    }
}
