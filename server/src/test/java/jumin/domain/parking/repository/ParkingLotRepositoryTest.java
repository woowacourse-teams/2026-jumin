package jumin.domain.parking.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import jumin.TestcontainersConfiguration;
import jumin.domain.parking.entity.ParkingLot;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
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
    @DisplayName("viewport 내부와 경계의 활성 주차장만 조회한다")
    void finds_only_active_parking_lots_inside_viewport() {
        // given
        insertParkingLot("viewport-inside", "viewport 내부", "서울시 테스트 주소", true, 37.4990, 127.0279);
        insertParkingLot("viewport-boundary", "viewport 경계", "서울시 테스트 주소", true, 37.5000, 127.0280);
        insertParkingLot("viewport-outside", "viewport 외부", "서울시 테스트 주소", true, 37.5001, 127.0281);
        insertParkingLot("viewport-inactive", "viewport 비활성", "서울시 테스트 주소", false, 37.4990, 127.0279);
        insertParkingLot("viewport-missing-location", "viewport 위치 없음", "서울시 테스트 주소", true, null, null);
        insertParkingLot("viewport-missing-address", "viewport 주소 없음", null, true, 37.4990, 127.0279);

        // when
        List<ParkingLot> results = parkingLotRepository.findActiveWithinViewport(
                127.0270,
                37.4980,
                127.0280,
                37.5000,
                false,
                false,
                1
        );

        // then
        assertThat(results).extracting("name").containsExactly("viewport 내부", "viewport 경계");
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
    @DisplayName("위치 정보가 없어도 활성 주차장을 ID로 조회한다")
    void finds_active_parking_lot_without_requiring_location() {
        // given
        insertParkingLot("detail-active", "상세 주차장", "서울시 테스트 주소", true, null, null);
        insertParkingLot("detail-inactive", "비활성 상세 주차장", "서울시 테스트 주소", false, null, null);
        Long activeId = parkingLotId("detail-active");
        Long inactiveId = parkingLotId("detail-inactive");

        // when & then
        assertThat(parkingLotRepository.findActiveById(activeId)).isPresent();
        assertThat(parkingLotRepository.findActiveById(inactiveId)).isEmpty();
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

    @ParameterizedTest
    @CsvSource({
            "1, false, false, 무료 일반|무료 기계식|유료 일반|주말 무료|요금 미확인|운영 정보 없음",
            "1, true, false, 무료 일반|무료 기계식",
            "1, false, true, 무료 일반|유료 일반|주말 무료|요금 미확인|운영 정보 없음",
            "1, true, true, 무료 일반",
            "6, false, false, 무료 일반|무료 기계식|유료 일반|주말 무료|요금 미확인|운영 정보 없음",
            "6, true, false, 무료 일반|무료 기계식|주말 무료",
            "6, false, true, 무료 일반|유료 일반|주말 무료|요금 미확인|운영 정보 없음",
            "6, true, true, 무료 일반|주말 무료",
            "7, false, false, 무료 일반|무료 기계식|유료 일반|주말 무료|요금 미확인|운영 정보 없음",
            "7, true, false, 무료 일반|무료 기계식|주말 무료",
            "7, false, true, 무료 일반|유료 일반|주말 무료|요금 미확인|운영 정보 없음",
            "7, true, true, 무료 일반|주말 무료"
    })
    @DisplayName("무료와 기계식 제외 필터를 조합한다")
    void filters_viewport_parking_lots(
            int dayOfWeek, boolean freeOnly, boolean excludeMechanical, String expectedNames
    ) {
        // given
        insertFilterCandidate("무료 일반", false, false, false, false);
        insertFilterCandidate("무료 기계식", true, false, false, false);
        insertFilterCandidate("유료 일반", false, true, true, true);
        insertFilterCandidate("주말 무료", false, true, false, false);
        insertFilterCandidate("요금 미확인", false, null, null, null);
        insertParkingLot("no-operation", "운영 정보 없음", "서울시 테스트 주소", true, 37.4990, 127.0279);

        // when
        List<ParkingLot> results = parkingLotRepository.findActiveWithinViewport(
                127.0270, 37.4980, 127.0280, 37.5000, freeOnly, excludeMechanical, dayOfWeek
        );

        // then
        assertThat(results).extracting(ParkingLot::getName).containsExactly(expectedNames.split("\\|"));
    }

    @ParameterizedTest
    @CsvSource(value = {
            "1, true, false, false",
            "6, false, true, false",
            "7, false, false, true",
            "5, NULL, false, false",
            "6, false, NULL, false",
            "7, false, false, NULL"
    }, nullValues = "NULL")
    @DisplayName("오늘 유료 여부가 true 또는 null이면 기본 무료시간이 있어도 제외한다")
    void excludes_paid_or_unknown_today(
            int dayOfWeek, Boolean weekdayPaid, Boolean saturdayPaid, Boolean holidayPaid
    ) {
        // given
        insertFilterCandidate("오늘 무료 아님", false, weekdayPaid, saturdayPaid, holidayPaid);
        jdbcTemplate.update("""
                update parking_operations
                set base_free_minutes = 60, base_fee = 0, additional_fee = 500
                where parking_lot_id = ?
                """, parkingLotId("오늘 무료 아님"));

        // when
        List<ParkingLot> results = parkingLotRepository.findActiveWithinViewport(
                127.0270, 37.4980, 127.0280, 37.5000, true, false, dayOfWeek
        );

        // then
        assertThat(results).isEmpty();
    }

    @ParameterizedTest
    @CsvSource(value = {
            "1, false, true, true",
            "6, true, false, true",
            "7, true, true, false",
            "5, false, NULL, NULL",
            "6, NULL, false, NULL",
            "7, NULL, NULL, false"
    }, nullValues = "NULL")
    @DisplayName("다른 요일의 유료 여부나 공통 요금과 관계없이 오늘 무료이면 포함한다")
    void includes_free_today_regardless_of_other_days_or_common_fee(
            int dayOfWeek, Boolean weekdayPaid, Boolean saturdayPaid, Boolean holidayPaid
    ) {
        // given
        insertFilterCandidate("오늘 무료", false, weekdayPaid, saturdayPaid, holidayPaid);
        jdbcTemplate.update("""
                update parking_operations
                set base_fee = 1000, additional_fee = 500, monthly_fee = 100000
                where parking_lot_id = ?
                """, parkingLotId("오늘 무료"));

        // when
        List<ParkingLot> results = parkingLotRepository.findActiveWithinViewport(
                127.0270, 37.4980, 127.0280, 37.5000, true, false, dayOfWeek
        );

        // then
        assertThat(results).extracting(ParkingLot::getName).containsExactly("오늘 무료");
    }

    @Test
    @DisplayName("기계식 값을 생략하면 DB와 엔티티에서 false로 처리한다")
    void defaults_mechanical_flag_to_false() {
        // given
        insertParkingLot("default-mechanical", "기본값 주차장", "서울시 테스트 주소", true, 37.4990, 127.0279);

        // when
        ParkingLot parkingLot = parkingLotRepository.findById(parkingLotId("default-mechanical")).orElseThrow();

        // then
        assertThat(parkingLot.isMechanical()).isFalse();
        assertThat(jdbcTemplate.queryForObject(
                "select mechanical from parking_lots where id = ?", Boolean.class, parkingLot.getId()
        )).isFalse();
        assertThat(new ParkingLot().isMechanical()).isFalse();
    }

    private void insertFilterCandidate(
            String name, boolean mechanical, Boolean weekdayPaid, Boolean saturdayPaid, Boolean holidayPaid
    ) {
        insertParkingLot(name, name, "서울시 테스트 주소", true, 37.4990, 127.0279);
        Long id = parkingLotId(name);
        jdbcTemplate.update("update parking_lots set mechanical = ? where id = ?", mechanical, id);
        jdbcTemplate.update("""
                insert into parking_operations (
                    parking_lot_id, weekday_paid, saturday_paid, holiday_paid,
                    source_checked_at, created_at, updated_at
                ) values (?, ?, ?, ?, current_timestamp, current_timestamp, current_timestamp)
                """, id, weekdayPaid, saturdayPaid, holidayPaid);
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
