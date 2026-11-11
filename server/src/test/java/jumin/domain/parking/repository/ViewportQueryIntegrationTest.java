package jumin.domain.parking.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import jumin.TestcontainersConfiguration;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.domain.parking.dto.ParkingLotViewportResponse;
import jumin.domain.parking.model.ViewportBounds;
import jumin.domain.parking.model.ViewportDeadline;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ViewportQueryIntegrationTest {

    @Autowired
    private ViewportRepository repository;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void clearParkingLots() {
        jdbcTemplate.execute("TRUNCATE parking_lots CASCADE");
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    @DisplayName("viewport 내부와 경계의 활성 주차장만 조회한다")
    void finds_only_active_parking_lots_inside_viewport(boolean isPublic) {
        // given
        insertParkingLot("viewport-inside", "viewport 내부", "서울시 테스트 주소", true, 37.4990, 127.0279);
        insertParkingLot("viewport-boundary", "viewport 경계", "서울시 테스트 주소", true, 37.5000, 127.0280);
        insertParkingLot("viewport-outside", "viewport 외부", "서울시 테스트 주소", true, 37.5001, 127.0281);
        insertParkingLot("viewport-inactive", "viewport 비활성", "서울시 테스트 주소", false, 37.4990, 127.0279);
        insertParkingLot("viewport-missing-location", "viewport 위치 없음", "서울시 테스트 주소", true, null, null);
        insertParkingLot("viewport-missing-address", "viewport 주소 없음", null, true, 37.4990, 127.0279);
        jdbcTemplate.update("update parking_lots set is_public = true");

        // when
        List<ParkingLotViewportResponse> results = findWithinBounds(
                127.0270,
                37.4980,
                127.0280,
                37.5000,
                false,
                false,
                isPublic,
                1
        );

        // then
        assertThat(results).extracting(ParkingLotViewportResponse::id)
                .containsExactlyElementsOf(idsForNames("viewport 내부", "viewport 경계"));
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
        List<ParkingLotViewportResponse> results = findWithinBounds(
                127.0270, 37.4980, 127.0280, 37.5000, freeOnly, excludeMechanical, false, dayOfWeek
        );

        // then
        assertThat(results).extracting(ParkingLotViewportResponse::id)
                .containsExactlyElementsOf(idsForNames(expectedNames.split("\\|")));
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
        List<ParkingLotViewportResponse> results = findWithinBounds(
                127.0270, 37.4980, 127.0280, 37.5000, true, false, false, dayOfWeek
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
        List<ParkingLotViewportResponse> results = findWithinBounds(
                127.0270, 37.4980, 127.0280, 37.5000, true, false, false, dayOfWeek
        );

        // then
        assertThat(results).extracting(ParkingLotViewportResponse::id)
                .containsExactlyElementsOf(idsForNames("오늘 무료"));
    }

    @ParameterizedTest
    @CsvSource({
            "false, false, false, 공영 무료|공영 무료 기계식|공영 유료|민영 무료|미확인 무료|공영 운영정보 없음",
            "true, false, false, 공영 무료|공영 무료 기계식|민영 무료|미확인 무료",
            "false, true, false, 공영 무료|공영 유료|민영 무료|미확인 무료|공영 운영정보 없음",
            "true, true, false, 공영 무료|민영 무료|미확인 무료",
            "false, false, true, 공영 무료|공영 무료 기계식|공영 유료|공영 운영정보 없음",
            "true, false, true, 공영 무료|공영 무료 기계식",
            "false, true, true, 공영 무료|공영 유료|공영 운영정보 없음",
            "true, true, true, 공영 무료"
    })
    @DisplayName("공영 필터는 민영과 미확인을 제외하고 무료 및 기계식 필터와 AND로 조합한다")
    void combines_public_filter_with_other_viewport_filters(
            boolean freeOnly, boolean excludeMechanical, boolean isPublic, String expectedNames
    ) {
        // given
        insertFilterCandidate("공영 무료", false, false, false, false);
        insertFilterCandidate("공영 무료 기계식", true, false, false, false);
        insertFilterCandidate("공영 유료", false, true, true, true);
        insertFilterCandidate("민영 무료", false, false, false, false);
        insertFilterCandidate("미확인 무료", false, false, false, false);
        insertParkingLot("공영 운영정보 없음", "공영 운영정보 없음", "서울시 테스트 주소", true, 37.4990, 127.0279);
        jdbcTemplate.update("update parking_lots set is_public = true where name in (?, ?, ?, ?)",
                "공영 무료", "공영 무료 기계식", "공영 유료", "공영 운영정보 없음");
        jdbcTemplate.update("update parking_lots set is_public = false where name = ?", "민영 무료");

        // when
        List<ParkingLotViewportResponse> results = findWithinBounds(
                127.0270, 37.4980, 127.0280, 37.5000, freeOnly, excludeMechanical, isPublic, 1
        );

        // then
        assertThat(results).extracting(ParkingLotViewportResponse::id)
                .containsExactlyElementsOf(idsForNames(expectedNames.split("\\|")));
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

    @ParameterizedTest
    @NullSource
    @ValueSource(ints = {0, 50, 200})
    @DisplayName("전체 조회는 구획 수의 0점과 LOD 점수 및 좌표를 그대로 반환한다")
    void returns_capacity_score_and_coordinates(Integer capacity) {
        // given
        insertParkingLot("score", "점수 주차장", "서울", true, 37.4990, 127.0279);
        jdbcTemplate.update("UPDATE parking_lots SET capacity = ? WHERE id = ?", capacity, parkingLotId("score"));
        double expected = 0.0;
        if (capacity != null && capacity == 50) {
            expected = 0.5;
        }
        if (capacity != null && capacity == 200) {
            expected = 0.8;
        }

        // when
        var rows = findWithinBounds(127.027, 37.498, 127.028, 37.5, false, false, false, 1);

        // then
        assertThat(rows).containsExactly(new ParkingLotViewportResponse(parkingLotId("score"),
                37.4990, 127.0279, expected));
    }

    @Test
    @DisplayName("전체 조회의 빈 영역은 빈 목록이고 같은 주차장의 점수는 조회 범위에 의존하지 않는다")
    void keeps_score_stable_and_returns_empty_area() {
        // given
        insertParkingLot("score", "점수 주차장", "서울", true, 37.4990, 127.0279);
        jdbcTemplate.update("UPDATE parking_lots SET capacity = 100 WHERE id = ?", parkingLotId("score"));

        // when
        var narrow = findWithinBounds(127.027, 37.498, 127.028, 37.5, false, false, false, 1);
        var wide = findWithinBounds(127.0, 37.48, 127.04, 37.52, false, false, false, 1);
        var empty = findWithinBounds(128.0, 37.48, 128.04, 37.52, false, false, false, 1);

        // then
        assertThat(narrow).hasSize(1).isEqualTo(wide);
        assertThat(narrow.getFirst().score()).isEqualTo(0.6666666666666666);
        assertThat(empty).isEmpty();
    }

    private List<ParkingLotViewportResponse> findWithinBounds(double west, double south, double east, double north,
                                                            boolean free, boolean mechanical, boolean isPublic, int day) {
        ParkingLotViewportRequest request = new ParkingLotViewportRequest(west, south, east, north,
                free, mechanical, isPublic);
        return repository.findWithinBounds(ViewportBounds.from(request), request, day,
                ViewportDeadline.after(Duration.ofSeconds(10))).parkingLots();
    }

    private List<Long> idsForNames(String... names) {
        return Arrays.stream(names).map(name -> jdbcTemplate.queryForObject(
                "SELECT id FROM parking_lots WHERE name = ?", Long.class, name)).toList();
    }
}
