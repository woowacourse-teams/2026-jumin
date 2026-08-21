package jumin.domain.parking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.Optional;
import jumin.domain.parking.dto.ParkingLotDetailResponse;
import jumin.domain.parking.dto.ParkingSearchRequest;
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

class ParkingLotDetailServiceTest {

    private final ParkingLotRepository parkingLotRepository = mock(ParkingLotRepository.class);
    private final ParkingOperationRepository parkingOperationRepository = mock(ParkingOperationRepository.class);
    private final ParkingSearchQueryValidator queryValidator = mock(ParkingSearchQueryValidator.class);
    private final ParkingOperationEvaluator operationEvaluator = mock(ParkingOperationEvaluator.class);
    private final GeoDistanceCalculator geoDistanceCalculator = mock(GeoDistanceCalculator.class);
    private ParkingLotDetailService service;

    @BeforeEach
    void setUp() {
        service = new ParkingLotDetailService(
                parkingLotRepository,
                parkingOperationRepository,
                queryValidator,
                operationEvaluator,
                geoDistanceCalculator
        );
    }

    @Test
    @DisplayName("주차장 상세 정보와 거리, 예상 요금, 운영 정보를 반환한다")
    void returns_parking_lot_detail_with_distance_fee_and_operation() {
        // given
        ParkingSearchRequest request = request();
        ParkingLot parkingLot = parkingLot();
        ParkingOperation operation = parkingOperation();
        when(parkingLotRepository.findById(1L)).thenReturn(Optional.of(parkingLot));
        when(parkingOperationRepository.findById(1L)).thenReturn(Optional.of(operation));
        when(geoDistanceCalculator.distanceMeters(
                new Coordinate(37.4981, 127.0279),
                new Coordinate(37.4990, 127.0290)
        )).thenReturn(310);
        when(operationEvaluator.evaluate(operation, request.entryAt(), request.exitAt()))
                .thenReturn(ParkingAvailabilityStatus.AVAILABLE);

        // when
        ParkingLotDetailResponse result = service.getDetail(1L, request);

        // then
        assertThat(result.id()).isEqualTo(1L);
        assertThat(result.name()).isEqualTo("역삼문화공원 제1호 공영주차장");
        assertThat(result.address()).isEqualTo("서울 강남구 테헤란로7길 21");
        assertThat(result.location().latitude()).isEqualTo(37.4990);
        assertThat(result.location().longitude()).isEqualTo(127.0290);
        assertThat(result.capacity()).isEqualTo(42);
        assertThat(result.distanceMeters()).isEqualTo(310);
        assertThat(result.estimatedFee()).isEqualTo(6_000);
        assertThat(result.feeCalculationStatus()).isEqualTo("CALCULATED");
        assertThat(result.feeRule().baseFreeMinutes()).isZero();
        assertThat(result.feeRule().baseMinutes()).isEqualTo(30);
        assertThat(result.feeRule().baseFee()).isEqualTo(3_000);
        assertThat(result.feeRule().additionalMinutes()).isEqualTo(10);
        assertThat(result.feeRule().additionalFee()).isEqualTo(1_000);
        assertThat(result.feeRule().dailyMaxFee()).isEqualTo(30_000);
        assertThat(result.operation().availabilityStatus()).isEqualTo("AVAILABLE");
        assertThat(result.operation().weekday().status()).isEqualTo("OPEN");
        assertThat(result.operation().weekday().openTime()).isEqualTo("00:00");
        assertThat(result.operation().weekday().closeTime()).isEqualTo("00:00");
        assertThat(result.operation().weekday().paid()).isTrue();
        assertThat(result.operation().weekend().openTime()).isEqualTo("09:00");
        assertThat(result.operation().weekend().closeTime()).isEqualTo("18:00");
        assertThat(result.operation().weekend().paid()).isNull();
        assertThat(result.operation().holiday().status()).isEqualTo("CLOSED");
        verify(queryValidator).validateForDetail(request);
    }

    @Test
    @DisplayName("운영 정보가 없으면 요금과 요금 규칙을 반환하지 않고 운영 상태를 미상으로 반환한다")
    void returns_unknown_and_null_fee_fields_when_operation_is_missing() {
        // given
        ParkingSearchRequest request = request();
        ParkingLot parkingLot = parkingLot();
        when(parkingLotRepository.findById(1L)).thenReturn(Optional.of(parkingLot));
        when(parkingOperationRepository.findById(1L)).thenReturn(Optional.empty());
        when(geoDistanceCalculator.distanceMeters(
                new Coordinate(37.4981, 127.0279),
                new Coordinate(37.4990, 127.0290)
        )).thenReturn(310);

        // when
        ParkingLotDetailResponse result = service.getDetail(1L, request);

        // then
        assertThat(result.estimatedFee()).isNull();
        assertThat(result.feeCalculationStatus()).isEqualTo("UNAVAILABLE");
        assertThat(result.feeRule()).isNull();
        assertThat(result.operation().availabilityStatus()).isEqualTo("UNKNOWN");
        assertThat(result.operation().weekday().status()).isEqualTo("UNKNOWN");
        assertThat(result.operation().weekday().openTime()).isNull();
        assertThat(result.operation().weekday().paid()).isNull();
    }

    @Test
    @DisplayName("주차장이 없으면 주차장 미존재 예외를 던진다")
    void throws_parking_lot_not_found_when_parking_lot_does_not_exist() {
        // given
        ParkingSearchRequest request = request();
        when(parkingLotRepository.findById(999L)).thenReturn(Optional.empty());

        // when & then
        assertThatThrownBy(() -> service.getDetail(999L, request))
                .isInstanceOf(BusinessException.class)
                .hasMessage(ErrorCode.PARKING_LOT_NOT_FOUND.getMessage());
    }

    private ParkingSearchRequest request() {
        return new ParkingSearchRequest(
                37.4981,
                127.0279,
                OffsetDateTime.parse("2026-08-21T19:00:00+09:00"),
                OffsetDateTime.parse("2026-08-21T20:00:00+09:00")
        );
    }

    private ParkingLot parkingLot() {
        ParkingLot parkingLot = new ParkingLot();
        ReflectionTestUtils.setField(parkingLot, "id", 1L);
        ReflectionTestUtils.setField(parkingLot, "name", "역삼문화공원 제1호 공영주차장");
        ReflectionTestUtils.setField(parkingLot, "address", "서울 강남구 테헤란로7길 21");
        ReflectionTestUtils.setField(parkingLot, "latitude", 37.4990);
        ReflectionTestUtils.setField(parkingLot, "longitude", 127.0290);
        ReflectionTestUtils.setField(parkingLot, "capacity", 42);
        return parkingLot;
    }

    private ParkingOperation parkingOperation() {
        ParkingOperation operation = new ParkingOperation();
        ReflectionTestUtils.setField(operation, "parkingLotId", 1L);
        ReflectionTestUtils.setField(operation, "baseFreeMinutes", 0);
        ReflectionTestUtils.setField(operation, "baseMinutes", 30);
        ReflectionTestUtils.setField(operation, "baseFee", 3_000);
        ReflectionTestUtils.setField(operation, "additionalMinutes", 10);
        ReflectionTestUtils.setField(operation, "additionalFee", 1_000);
        ReflectionTestUtils.setField(operation, "dailyMaxFee", 30_000);
        ReflectionTestUtils.setField(operation, "weekdayPaid", true);
        ReflectionTestUtils.setField(operation, "saturdayPaid", null);
        ReflectionTestUtils.setField(operation, "holidayPaid", null);
        ReflectionTestUtils.setField(operation, "weekdayStatus", ParkingOperationStatus.OPEN);
        ReflectionTestUtils.setField(operation, "weekdayOpenTime", LocalTime.MIDNIGHT);
        ReflectionTestUtils.setField(operation, "weekdayCloseTime", LocalTime.MIDNIGHT);
        ReflectionTestUtils.setField(operation, "weekendStatus", ParkingOperationStatus.OPEN);
        ReflectionTestUtils.setField(operation, "weekendOpenTime", LocalTime.of(9, 0));
        ReflectionTestUtils.setField(operation, "weekendCloseTime", LocalTime.of(18, 0));
        ReflectionTestUtils.setField(operation, "holidayStatus", ParkingOperationStatus.CLOSED);
        return operation;
    }
}
