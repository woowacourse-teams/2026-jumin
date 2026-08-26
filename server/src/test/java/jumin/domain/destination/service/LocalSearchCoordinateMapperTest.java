package jumin.domain.destination.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class LocalSearchCoordinateMapperTest {

    @Test
    @DisplayName("지역 검색 WGS84 정수 좌표를 위도와 경도로 변환한다")
    void maps_wgs84_integer_coordinates() {
        // when
        GeoCoordinate coordinate =
                LocalSearchCoordinateMapper.toGeoCoordinate("1269873882", "375666103");

        // then
        assertThat(coordinate.longitude()).isEqualTo(126.9873882);
        assertThat(coordinate.latitude()).isEqualTo(37.5666103);
    }
}
