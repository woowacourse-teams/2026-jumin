package jumin.domain.parking.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ParkingBalancedScoreCalculatorTest {

    private final ParkingBalancedScoreCalculator calculator = new ParkingBalancedScoreCalculator();

    @Test
    @DisplayName("거리와 요금에 동일한 가중치로 고정 기준점수를 계산한다")
    void calculates_score_against_fixed_references() {
        // when
        Double firstScore = calculator.calculate(ParkingAvailabilityStatus.AVAILABLE, 100, 3_000, 60);
        Double secondScore = calculator.calculate(ParkingAvailabilityStatus.AVAILABLE, 300, 1_000, 60);

        // then
        assertThat(firstScore).isEqualTo(0.2500);
        assertThat(secondScore).isEqualTo(0.3056);
    }

    @Test
    @DisplayName("점수를 0에서 1 사이로 제한한다")
    void keeps_score_within_zero_and_one() {
        // when
        Double minimumScore = calculator.calculate(ParkingAvailabilityStatus.AVAILABLE, 100, 0, 60);
        Double maximumScore = calculator.calculate(ParkingAvailabilityStatus.AVAILABLE, 1_200, 9_000, 60);

        // then
        assertThat(minimumScore).isEqualTo(0.0833);
        assertThat(maximumScore).isEqualTo(1.0);
    }

    @Test
    @DisplayName("운영 불가이거나 요금이 없으면 점수를 계산하지 않는다")
    void returns_null_when_score_inputs_are_insufficient() {
        // when
        Double unavailableScore = calculator.calculate(ParkingAvailabilityStatus.UNAVAILABLE, 100, 1_000, 60);
        Double missingFeeScore = calculator.calculate(ParkingAvailabilityStatus.AVAILABLE, 100, null, 60);

        // then
        assertThat(unavailableScore).isNull();
        assertThat(missingFeeScore).isNull();
    }
}
