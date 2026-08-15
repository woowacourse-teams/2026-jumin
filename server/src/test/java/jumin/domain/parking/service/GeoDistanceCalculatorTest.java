package jumin.domain.parking.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class GeoDistanceCalculatorTest {

    private final GeoDistanceCalculator calculator = new GeoDistanceCalculator();

    @Test
    @DisplayName("같은 좌표의 거리는 0미터다")
    void returns_zero_for_same_coordinates() {
        // given
        Coordinate coordinate = new Coordinate(37.5, 127.0);

        // when
        int distanceMeters = calculator.distanceMeters(
                coordinate,
                coordinate
        );

        // then
        assertThat(distanceMeters).isZero();
    }

    @Test
    @DisplayName("위도 1도 차이를 미터 단위 거리로 계산한다")
    void calculates_distance_in_meters() {
        // given
        Coordinate from = new Coordinate(0.0, 0.0);
        Coordinate to = new Coordinate(1.0, 0.0);

        // when
        int distanceMeters = calculator.distanceMeters(from, to);

        // then
        assertThat(distanceMeters).isEqualTo(111_195);
    }

    @Test
    @DisplayName("두 좌표 사이 거리는 방향을 바꿔도 동일하다")
    void distance_is_symmetric() {
        // given
        Coordinate from = new Coordinate(37.5, 127.0);
        Coordinate to = new Coordinate(37.51, 127.02);

        // when
        int forwardDistance = calculator.distanceMeters(from, to);
        int reverseDistance = calculator.distanceMeters(to, from);

        // then
        assertThat(forwardDistance).isEqualTo(reverseDistance);
    }
}
