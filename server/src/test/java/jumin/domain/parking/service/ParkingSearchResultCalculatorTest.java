package jumin.domain.parking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.Optional;
import jumin.domain.parking.dto.ParkingLotResponse;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parking.entity.ParkingOperation;
import jumin.domain.parking.repository.ParkingOperationRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class ParkingSearchResultCalculatorTest {

    private final ParkingOperationRepository parkingOperationRepository = mock(ParkingOperationRepository.class);
    private final ParkingOperationEvaluator operationEvaluator = mock(ParkingOperationEvaluator.class);
    private final GeoDistanceCalculator geoDistanceCalculator = mock(GeoDistanceCalculator.class);
    private final ParkingSearchResultCalculator calculator = new ParkingSearchResultCalculator(
            parkingOperationRepository,
            operationEvaluator,
            geoDistanceCalculator
    );

    @Test
    @DisplayName("거리와 요금에 동일한 가중치로 고정 기준점수를 계산한다")
    void calculates_score_against_fixed_references() {
        // given
        // Fixed availability, distance, fee, and duration inputs are supplied to the calculator.

        // when
        Double firstScore = calculateScore(ParkingAvailabilityStatus.AVAILABLE, 100, 3_000, 60);
        Double secondScore = calculateScore(ParkingAvailabilityStatus.AVAILABLE, 300, 1_000, 60);

        // then
        assertThat(firstScore).isEqualTo(0.2500);
        assertThat(secondScore).isEqualTo(0.3056);
    }

    @Test
    @DisplayName("점수를 0에서 1 사이로 제한한다")
    void keeps_score_within_zero_and_one() {
        // given
        // Boundary distance and fee inputs are supplied to the calculator.

        // when
        Double minimumScore = calculateScore(ParkingAvailabilityStatus.AVAILABLE, 100, 0, 60);
        Double maximumScore = calculateScore(ParkingAvailabilityStatus.AVAILABLE, 1_200, 9_000, 60);

        // then
        assertThat(minimumScore).isEqualTo(0.0833);
        assertThat(maximumScore).isEqualTo(1.0);
    }

    @Test
    @DisplayName("운영 불가 주차장은 요금과 균형점수를 제공하지 않는다")
    void omits_fee_and_score_when_operation_is_unavailable() {
        // given
        when(parkingOperationRepository.findById(1L))
                .thenReturn(Optional.of(parkingOperation(30, 1_000)));
        when(operationEvaluator.evaluate(any(), any(), any())).thenReturn(ParkingAvailabilityStatus.UNAVAILABLE);
        when(geoDistanceCalculator.distanceMeters(any(), any())).thenReturn(100);

        // when
        ParkingLotResponse result = calculator.calculate(
                parkingLot(),
                new Coordinate(37.4981, 127.0279),
                searchRequest(),
                60
        );

        // then
        assertThat(result.estimatedFee()).isNull();
        assertThat(result.balancedScore()).isNull();
        assertThat(result.availabilityStatus()).isEqualTo("UNAVAILABLE");
    }

    @Test
    @DisplayName("운영정보가 없으면 운영 확인 필요 상태와 빈 요금·점수를 반환한다")
    void omits_fee_and_score_when_operation_is_missing() {
        // given
        when(parkingOperationRepository.findById(1L)).thenReturn(Optional.empty());
        when(operationEvaluator.evaluate(any(), any(), any())).thenReturn(ParkingAvailabilityStatus.UNKNOWN);
        when(geoDistanceCalculator.distanceMeters(any(), any())).thenReturn(100);

        // when
        ParkingLotResponse result = calculator.calculate(
                parkingLot(),
                new Coordinate(37.4981, 127.0279),
                searchRequest(),
                60
        );

        // then
        assertThat(result.estimatedFee()).isNull();
        assertThat(result.balancedScore()).isNull();
        assertThat(result.availabilityStatus()).isEqualTo("UNKNOWN");
    }

    private Double calculateScore(
            ParkingAvailabilityStatus status,
            int distanceMeters,
            int estimatedFee,
            int durationMinutes
    ) {
        when(parkingOperationRepository.findById(1L))
                .thenReturn(Optional.of(parkingOperation(durationMinutes, estimatedFee)));
        when(operationEvaluator.evaluate(any(), any(), any())).thenReturn(status);
        when(geoDistanceCalculator.distanceMeters(any(), any())).thenReturn(distanceMeters);

        ParkingLotResponse result = calculator.calculate(
                parkingLot(),
                new Coordinate(37.4981, 127.0279),
                searchRequest(),
                durationMinutes
        );
        return result.balancedScore();
    }

    private ParkingLot parkingLot() {
        ParkingLot parkingLot = new ParkingLot();
        ReflectionTestUtils.setField(parkingLot, "id", 1L);
        ReflectionTestUtils.setField(parkingLot, "name", "테스트 주차장");
        ReflectionTestUtils.setField(parkingLot, "address", "서울시 테스트 주소");
        ReflectionTestUtils.setField(parkingLot, "latitude", 37.4982);
        ReflectionTestUtils.setField(parkingLot, "longitude", 127.0280);
        return parkingLot;
    }

    private ParkingOperation parkingOperation(int durationMinutes, int estimatedFee) {
        ParkingOperation operation = new ParkingOperation();
        ReflectionTestUtils.setField(operation, "parkingLotId", 1L);
        ReflectionTestUtils.setField(operation, "baseMinutes", durationMinutes);
        ReflectionTestUtils.setField(operation, "baseFee", estimatedFee);
        return operation;
    }

    private ParkingSearchRequest searchRequest() {
        return new ParkingSearchRequest(
                37.4981,
                127.0279,
                OffsetDateTime.parse("2026-08-15T10:00:00+09:00"),
                OffsetDateTime.parse("2026-08-15T11:00:00+09:00")
        );
    }
}
