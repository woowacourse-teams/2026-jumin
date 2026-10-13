package jumin.domain.parking.service;

import static org.assertj.core.api.Assertions.assertThat;

import jumin.domain.parking.entity.ParkingLot;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

class ParkingLodScoreCalculatorTest {

    private final ParkingLodScoreCalculator calculator = new ParkingLodScoreCalculator();

    @ParameterizedTest
    @NullSource
    @ValueSource(ints = {0, -1, Integer.MIN_VALUE})
    @DisplayName("구획 수가 없거나 0 이하이면 0점을 반환한다")
    void returns_zero_when_capacity_is_missing_or_non_positive(Integer capacity) {
        // given
        ParkingLot parkingLot = parkingLot(capacity);

        // when
        double score = calculator.calculate(parkingLot);

        // then
        assertThat(score).isZero();
    }

    @ParameterizedTest
    @CsvSource({
            "50, 0.5",
            "100, 0.6666666666666666",
            "200, 0.8",
            "500, 0.9090909090909091",
            "1000, 0.9523809523809523"
    })
    @DisplayName("고정 기준으로 규모 점수를 계산하고 반올림하지 않는다")
    void calculates_capacity_score_without_rounding(int capacity, double expectedScore) {
        // given
        ParkingLot parkingLot = parkingLot(capacity);

        // when
        double score = calculator.calculate(parkingLot);

        // then
        assertThat(score).isEqualTo(expectedScore);
    }

    @Test
    @DisplayName("구획 수가 커지면 점수가 증가한다")
    void increases_score_as_capacity_increases() {
        // given
        ParkingLot smaller = parkingLot(50);
        ParkingLot larger = parkingLot(100);

        // when
        double smallerScore = calculator.calculate(smaller);
        double largerScore = calculator.calculate(larger);

        // then
        assertThat(largerScore).isGreaterThan(smallerScore);
    }

    @Test
    @DisplayName("최대 정수 구획 수도 오버플로 없이 0보다 크고 1보다 작은 유한한 점수를 반환한다")
    void keeps_score_finite_for_maximum_capacity() {
        // given
        ParkingLot parkingLot = parkingLot(Integer.MAX_VALUE);

        // when
        double score = calculator.calculate(parkingLot);

        // then
        assertThat(score).isFinite().isGreaterThan(0.0).isLessThan(1.0);
    }

    private ParkingLot parkingLot(Integer capacity) {
        ParkingLot parkingLot = new ParkingLot();
        ReflectionTestUtils.setField(parkingLot, "capacity", capacity);
        return parkingLot;
    }
}
