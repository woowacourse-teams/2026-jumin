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
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import jumin.domain.parking.dto.ParkingLotResponse;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.domain.parking.dto.ParkingSearchResponse;
import jumin.domain.parking.dto.ParkingViewportRequest;
import jumin.domain.parking.dto.ParkingViewportResponse;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parking.entity.ParkingOperation;
import jumin.domain.parking.entity.ParkingOperationStatus;
import jumin.domain.parking.repository.ParkingLotRepository;
import jumin.domain.parking.repository.ParkingOperationRepository;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
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
    @DisplayName("토요일 무료 주차장은 예상 요금을 0원으로 반환한다")
    void returns_zero_fee_for_saturday_free_status() {
        // given
        ParkingLot candidate = parkingLot(6L, 37.4982, 127.0280);
        ParkingOperation operation = availableOperation(6L);
        ReflectionTestUtils.setField(operation, "saturdayPaid", false);
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenReturn(List.of(candidate));
        when(parkingOperationRepository.findAllByParkingLotIdIn(anyList()))
                .thenReturn(List.of(operation));

        // when
        ParkingLotResponse result = service.search(query(
                "2026-08-22T10:00:00+09:00",
                "2026-08-22T11:00:00+09:00"
        )).parkingLots().getFirst();

        // then
        assertThat(result.availabilityStatus()).isEqualTo("AVAILABLE");
        assertThat(result.estimatedFee()).isZero();
        assertThat(result.balancedScore()).isEqualTo(0.0117);
    }

    @Test
    @DisplayName("일요일·공휴일 무료 주차장은 예상 요금을 0원으로 반환한다")
    void returns_zero_fee_for_holiday_free_status() {
        // given
        ParkingLot candidate = parkingLot(7L, 37.4982, 127.0280);
        ParkingOperation operation = availableOperation(7L);
        ReflectionTestUtils.setField(operation, "holidayPaid", false);
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenReturn(List.of(candidate));
        when(parkingOperationRepository.findAllByParkingLotIdIn(anyList()))
                .thenReturn(List.of(operation));

        // when
        ParkingLotResponse result = service.search(query(
                "2026-08-23T10:00:00+09:00",
                "2026-08-23T11:00:00+09:00"
        )).parkingLots().getFirst();

        // then
        assertThat(result.availabilityStatus()).isEqualTo("AVAILABLE");
        assertThat(result.estimatedFee()).isZero();
        assertThat(result.balancedScore()).isEqualTo(0.0117);
    }

    @Test
    @DisplayName("날짜별 유료 여부가 없으면 예상 요금을 계산하지 않는다")
    void returns_null_fee_when_paid_status_is_unknown() {
        // given
        ParkingLot candidate = parkingLot(8L, 37.4982, 127.0280);
        ParkingOperation operation = availableOperation(8L);
        ReflectionTestUtils.setField(operation, "weekdayPaid", null);
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenReturn(List.of(candidate));
        when(parkingOperationRepository.findAllByParkingLotIdIn(anyList()))
                .thenReturn(List.of(operation));

        // when
        ParkingLotResponse result = service.search(validQuery()).parkingLots().getFirst();

        // then
        assertThat(result.availabilityStatus()).isEqualTo("AVAILABLE");
        assertThat(result.estimatedFee()).isNull();
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

    @Test
    @DisplayName("viewport 주차장을 marker용 응답으로 변환한다")
    void maps_parking_lots_to_viewport_response() {
        // given
        ParkingLot parkingLot = mock(ParkingLot.class);
        when(parkingLot.getId()).thenReturn(1L);
        when(parkingLot.getName()).thenReturn("시청 주차장");
        when(parkingLot.getAddress()).thenReturn("서울특별시 중구 세종대로 110");
        when(parkingLot.getLatitude()).thenReturn(37.5665);
        when(parkingLot.getLongitude()).thenReturn(126.9780);
        when(parkingLotRepository.findActiveWithinViewport(
                126.9700,
                37.5600,
                126.9900,
                37.5750
        )).thenReturn(List.of(parkingLot));

        // when
        ParkingViewportResponse result = service.searchViewport(new ParkingViewportRequest(
                126.9700,
                37.5600,
                126.9900,
                37.5750
        ));

        // then
        assertThat(result.totalCount()).isEqualTo(1);
        assertThat(result.parkingLots()).hasSize(1);
        assertThat(result.parkingLots().getFirst().name()).isEqualTo("시청 주차장");
        assertThat(result.parkingLots().getFirst().location().latitude()).isEqualTo(37.5665);
    }

    @Test
    @DisplayName("서쪽 경도가 동쪽 경도보다 크면 DB를 호출하지 않고 400 오류를 반환한다")
    void rejects_reversed_longitude_bounds() {
        // given
        ParkingViewportRequest request = new ParkingViewportRequest(
                126.9900,
                37.5600,
                126.9700,
                37.5750
        );

        // when & then
        assertThatThrownBy(() -> service.searchViewport(request))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
        verifyNoInteractions(parkingLotRepository);
    }

    @Test
    @DisplayName("북쪽 위도가 남쪽 위도보다 작으면 DB를 호출하지 않고 400 오류를 반환한다")
    void rejects_reversed_latitude_bounds() {
        // given
        ParkingViewportRequest request = new ParkingViewportRequest(
                126.9700,
                37.5750,
                126.9900,
                37.5600
        );

        // when & then
        assertThatThrownBy(() -> service.searchViewport(request))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
        verifyNoInteractions(parkingLotRepository);
    }

    private ParkingSearchRequest validQuery() {
        return query(
                "2026-08-14T10:00:00+09:00",
                "2026-08-14T11:00:00+09:00"
        );
    }

    private ParkingSearchRequest query(String entryAt, String exitAt) {
        return new ParkingSearchRequest(
                37.4981,
                127.0279,
                OffsetDateTime.parse(entryAt),
                OffsetDateTime.parse(exitAt)
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
        ReflectionTestUtils.setField(operation, "weekdayPaid", true);
        ReflectionTestUtils.setField(operation, "saturdayPaid", true);
        ReflectionTestUtils.setField(operation, "holidayPaid", true);
        ReflectionTestUtils.setField(operation, "weekdayStatus", ParkingOperationStatus.OPEN);
        ReflectionTestUtils.setField(operation, "weekdayOpenTime", LocalTime.MIDNIGHT);
        ReflectionTestUtils.setField(operation, "weekdayCloseTime", LocalTime.MIDNIGHT);
        ReflectionTestUtils.setField(operation, "weekendStatus", ParkingOperationStatus.OPEN);
        ReflectionTestUtils.setField(operation, "weekendOpenTime", LocalTime.MIDNIGHT);
        ReflectionTestUtils.setField(operation, "weekendCloseTime", LocalTime.MIDNIGHT);
        ReflectionTestUtils.setField(operation, "holidayStatus", ParkingOperationStatus.OPEN);
        ReflectionTestUtils.setField(operation, "holidayOpenTime", LocalTime.MIDNIGHT);
        ReflectionTestUtils.setField(operation, "holidayCloseTime", LocalTime.MIDNIGHT);
        return operation;
    }

    private ParkingOperation unavailableOperation(long parkingLotId) {
        ParkingOperation operation = availableOperation(parkingLotId);
        ReflectionTestUtils.setField(operation, "weekdayStatus", ParkingOperationStatus.CLOSED);
        return operation;
    }
}
