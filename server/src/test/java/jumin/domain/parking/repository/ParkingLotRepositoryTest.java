package jumin.domain.parking.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.stream.IntStream;
import jumin.TestcontainersConfiguration;
import jumin.domain.parking.entity.ParkingLot;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
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

    @Test
    @DisplayName("공영 값이 없으면 DB와 엔티티에서 미확인 null로 유지한다")
    void retains_unknown_is_public_flag_as_null() {
        // given
        insertParkingLot("unknown-public", "공영 미확인", "서울시 테스트 주소", true, 37.4990, 127.0279);

        // when
        ParkingLot parkingLot = parkingLotRepository.findById(parkingLotId("unknown-public")).orElseThrow();

        // then
        assertThat(parkingLot.getIsPublic()).isNull();
        assertThat(jdbcTemplate.queryForObject(
                "select is_public from parking_lots where id = ?", Boolean.class, parkingLot.getId()
        )).isNull();
        assertThat(new ParkingLot().getIsPublic()).isNull();
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

    @Test
    @DisplayName("이름에 검색어가 포함된 활성 주차장을 조회하며 주소는 검색하지 않는다")
    void searches_name_only_and_preserves_nullable_address() {
        // given
        insertParkingLot("name-match", "강남 공영주차장", "서울시 테스트 주소", true, 37.5, 127.0);
        insertParkingLot("name-middle", "역삼 강남 주차장", null, true, 37.5, 127.0);
        insertParkingLot("address-only", "역삼 주차장", "서울시 강남구", true, 37.5, 127.0);
        insertParkingLot("inactive-match", "강남 비활성", "서울시", false, 37.5, 127.0);
        insertParkingLot("missing-match", "강남 위치없음", "서울시", true, null, null);

        // when
        List<ParkingLot> results = parkingLotRepository.findActiveByNameContaining("강남");

        // then
        assertThat(results).extracting(ParkingLot::getName)
                .containsExactly("강남 공영주차장", "역삼 강남 주차장");
        assertThat(results.getLast().getAddress()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"%_", "강남%", "강남_"})
    @DisplayName("검색어의 퍼센트와 밑줄을 와일드카드가 아닌 문자로 검색한다")
    void treats_like_wildcards_as_literal_characters(String query) {
        // given
        insertParkingLot("literal", "주차장 " + query, null, true, 37.5, 127.0);
        insertParkingLot("other", "강남 공영주차장", null, true, 37.5, 127.0);

        // when
        List<ParkingLot> results = parkingLotRepository.findActiveByNameContaining(query);

        // then
        assertThat(results).extracting(ParkingLot::getSourceExternalId).containsExactly("literal");
    }

    @Test
    @DisplayName("영문 대소문자를 구분하지 않고 최대 15건을 이름과 ID 순으로 조회한다")
    void searches_case_insensitively_with_stable_result_limit() {
        // given
        for (int index = 0; index < 17; index++) {
            insertParkingLot("limit-" + index, "Parking", "주소 " + index, true, 37.5, 127.0);
        }

        // when
        List<ParkingLot> results = parkingLotRepository.findActiveByNameContaining("parking");

        // then
        assertThat(results).hasSize(15);
        assertThat(results).extracting(ParkingLot::getId).isSorted();
        assertThat(results).extracting(ParkingLot::getSourceExternalId)
                .containsExactlyElementsOf(IntStream.range(0, 15)
                        .mapToObj(index -> "limit-" + index).toList());
    }

    @Test
    @DisplayName("완전 일치와 접두사 일치를 먼저 배치하고 부분 일치는 이름순으로 최대 15건을 조회한다")
    void ranks_exact_then_prefix_then_other_matches_before_limiting_results() {
        // given
        // 이름순으로 앞서는 부분 일치가 15건 제한을 채운다.
        for (int index = 0; index < 15; index++) {
            insertParkingLot("middle-" + index, "A%02d Parking".formatted(index), null, true, 37.5, 127.0);
        }
        insertParkingLot("middle-early-position", "B Parking", null, true, 37.5, 127.0);
        insertParkingLot("prefix", "Parking Center", null, true, 37.5, 127.0);
        insertParkingLot("exact", "Parking", null, true, 37.5, 127.0);

        // when
        List<ParkingLot> results = parkingLotRepository.findActiveByNameContaining("parking");

        // then
        assertThat(results).extracting(ParkingLot::getSourceExternalId)
                .hasSize(15)
                .startsWith("exact", "prefix", "middle-0", "middle-1")
                .endsWith("middle-12")
                .doesNotContain("middle-early-position");
    }

    @Test
    @DisplayName("이름이 일치하지 않으면 빈 목록을 반환한다")
    void returns_no_parking_lots_when_name_does_not_match() {
        // given
        insertParkingLot("other", "역삼 주차장", "강남", true, 37.5, 127.0);

        // when & then
        assertThat(parkingLotRepository.findActiveByNameContaining("강남")).isEmpty();
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
