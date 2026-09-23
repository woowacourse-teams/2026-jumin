package jumin.domain.walking.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class WalkingDurationCalculatorTest {

    private final WalkingDurationCalculator calculator = new WalkingDurationCalculator();

    @ParameterizedTest
    @CsvSource({
            "0, 0",
            "1, 1",
            "200, 3",
            "201, 4",
            "540, 9",
            "2147483647, 32212255"
    })
    @DisplayName("시속 4km 기준 도보 소요 시간을 분 단위로 올림한다")
    void calculates_walking_duration_by_rounding_up_minutes(int distanceMeters, int expectedMinutes) {
        // when
        Integer result = calculator.calculateMinutes(distanceMeters);

        // then
        assertThat(result).isEqualTo(expectedMinutes);
    }

    @Test
    @DisplayName("도보 거리가 없으면 소요 시간을 null로 반환한다")
    void returns_null_when_walking_distance_is_missing() {
        // when
        Integer result = calculator.calculateMinutes(null);

        // then
        assertThat(result).isNull();
    }
}
