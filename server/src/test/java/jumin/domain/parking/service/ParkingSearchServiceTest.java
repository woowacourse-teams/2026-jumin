package jumin.domain.parking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import jumin.domain.parking.dto.ParkingLotResponse;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.domain.parking.dto.ParkingSearchResponse;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parking.entity.ParkingOperation;
import jumin.domain.parking.entity.ParkingOperationStatus;
import jumin.domain.parking.repository.ParkingLotRepository;
import jumin.domain.parking.repository.ParkingOperationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.springframework.test.util.ReflectionTestUtils;

class ParkingSearchServiceTest {

    private final ParkingLotRepository parkingLotRepository = mock(ParkingLotRepository.class);
    private final ParkingOperationRepository parkingOperationRepository = mock(ParkingOperationRepository.class);
    private ParkingSearchService service;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(Instant.parse("2026-08-13T00:00:00Z"), ZoneOffset.UTC);
        GeoDistanceCalculator geoDistanceCalculator = new GeoDistanceCalculator();
        service = new ParkingSearchService(
                parkingLotRepository,
                parkingOperationRepository,
                new ParkingSearchQueryValidator(clock),
                new ParkingOperationEvaluator(),
                geoDistanceCalculator,
                new ParkingBalancedScoreCalculator()
        );
    }

    @Test
    @DisplayName("직선거리와 요금, 운영 상태, 균형점수를 응답에 매핑한다")
    void maps_straight_distance_fee_availability_and_balanced_score() {
        // given
        ParkingLot first = parkingLot(1L, 37.4982, 127.0280);
        ParkingLot second = parkingLot(2L, 37.4983, 127.0281);
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenReturn(List.of(first, second));
        when(parkingOperationRepository.findAllByParkingLotIdIn(anyList()))
                .thenReturn(List.of(availableOperation(1L), availableOperation(2L)));

        // when
        ParkingSearchResponse result = service.search(validQuery());

        // then
        assertThat(result.totalCount()).isEqualTo(2);
        assertThat(result.parkingLots()).extracting(ParkingLotResponse::distanceMeters)
                .containsExactlyInAnyOrder(14, 28);
        assertThat(result.parkingLots()).extracting(ParkingLotResponse::estimatedFee).containsOnly(2_500);
        assertThat(result.parkingLots()).extracting(ParkingLotResponse::availabilityStatus).containsOnly("AVAILABLE");
        assertThat(result.parkingLots()).extracting(ParkingLotResponse::balancedScore)
                .containsExactlyInAnyOrder(0.1506, 0.1622);
        verify(parkingOperationRepository).findAllByParkingLotIdIn(List.of(1L, 2L));
    }

    @Test
    @DisplayName("거리 재계산 결과가 반경을 벗어나면 후보에서 제외한다")
    void filters_candidates_outside_radius_after_distance_recalculation() {
        // given
        ParkingLot outside = parkingLot(3L, 37.5040, 127.0279);
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenReturn(List.of(outside));
        when(parkingOperationRepository.findAllByParkingLotIdIn(anyList()))
                .thenReturn(List.of(availableOperation(3L)));

        // when
        ParkingSearchResponse result = service.search(validQuery());

        // then
        assertThat(result.totalCount()).isZero();
        assertThat(result.parkingLots()).isEmpty();
    }

    @Test
    @DisplayName("활성 후보가 없으면 빈 결과를 성공으로 반환한다")
    void returns_empty_success_when_no_active_candidates_exist() {
        // given
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenReturn(List.of());

        // when
        ParkingSearchResponse result = service.search(validQuery());

        // then
        assertThat(result.searchRadiusMeters()).isEqualTo(600);
        assertThat(result.totalCount()).isZero();
        assertThat(result.parkingLots()).isEmpty();
        verify(parkingLotRepository).findActiveWithinRadius(anyDouble(), anyDouble(), eq(600));
        verifyNoInteractions(parkingOperationRepository);
    }

    @Test
    @DisplayName("운영정보가 없는 후보는 운영 확인 필요 상태로 반환한다")
    void returns_unknown_when_operation_is_missing_for_candidate() {
        // given
        ParkingLot candidate = parkingLot(4L, 37.4982, 127.0280);
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenReturn(List.of(candidate));
        when(parkingOperationRepository.findAllByParkingLotIdIn(anyList()))
                .thenReturn(List.of());

        // when
        ParkingLotResponse result = service.search(validQuery()).parkingLots().getFirst();

        // then
        assertThat(result.availabilityStatus()).isEqualTo("UNKNOWN");
        assertThat(result.estimatedFee()).isNull();
        assertThat(result.balancedScore()).isNull();
    }

    @Test
    @DisplayName("운영 불가 후보도 요금은 반환하고 균형점수는 생략한다")
    void returns_fee_without_score_when_operation_is_unavailable() {
        // given
        ParkingLot candidate = parkingLot(5L, 37.4982, 127.0280);
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenReturn(List.of(candidate));
        when(parkingOperationRepository.findAllByParkingLotIdIn(anyList()))
                .thenReturn(List.of(unavailableOperation(5L)));

        // when
        ParkingLotResponse result = service.search(validQuery()).parkingLots().getFirst();

        // then
        assertThat(result.availabilityStatus()).isEqualTo("UNAVAILABLE");
        assertThat(result.estimatedFee()).isEqualTo(2_500);
        assertThat(result.balancedScore()).isNull();
    }

    @Test
    @DisplayName("주차장 조회 중 저장소 예외를 그대로 전달한다")
    void propagates_repository_failure() {
        // given
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenThrow(new IllegalStateException("database detail"));

        // when & then
        assertThatThrownBy(() -> service.search(validQuery()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("database detail");
    }

    private ParkingSearchRequest validQuery() {
        return new ParkingSearchRequest(
                37.4981,
                127.0279,
                OffsetDateTime.parse("2026-08-14T10:00:00+09:00"),
                OffsetDateTime.parse("2026-08-14T11:00:00+09:00")
        );
    }

    private ParkingLot parkingLot(long id, double latitude, double longitude) {
        ParkingLot lot = new ParkingLot();
        ReflectionTestUtils.setField(lot, "id", id);
        ReflectionTestUtils.setField(lot, "name", "주차장 " + id);
        ReflectionTestUtils.setField(lot, "address", "서울시 주소 " + id);
        ReflectionTestUtils.setField(lot, "latitude", latitude);
        ReflectionTestUtils.setField(lot, "longitude", longitude);
        return lot;
    }

    private ParkingOperation availableOperation(long parkingLotId) {
        ParkingOperation operation = new ParkingOperation();
        ReflectionTestUtils.setField(operation, "parkingLotId", parkingLotId);
        ReflectionTestUtils.setField(operation, "baseMinutes", 30);
        ReflectionTestUtils.setField(operation, "baseFee", 1_000);
        ReflectionTestUtils.setField(operation, "additionalMinutes", 10);
        ReflectionTestUtils.setField(operation, "additionalFee", 500);
        ReflectionTestUtils.setField(operation, "dailyMaxFee", null);
        ReflectionTestUtils.setField(operation, "fridayStatus", ParkingOperationStatus.ALL_DAY);
        return operation;
    }

    private ParkingOperation unavailableOperation(long parkingLotId) {
        ParkingOperation operation = availableOperation(parkingLotId);
        ReflectionTestUtils.setField(operation, "thursdayStatus", ParkingOperationStatus.CLOSED);
        ReflectionTestUtils.setField(operation, "fridayStatus", ParkingOperationStatus.CLOSED);
        return operation;
    }
}
