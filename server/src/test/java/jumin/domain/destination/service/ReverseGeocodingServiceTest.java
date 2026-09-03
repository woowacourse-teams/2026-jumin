package jumin.domain.destination.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

import jumin.domain.destination.client.ReverseGeocodingClient;
import jumin.domain.destination.client.ReverseGeocodingResult;
import jumin.domain.destination.dto.ReverseGeocodeRequest;
import jumin.domain.destination.dto.ReverseGeocodeResponse;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ReverseGeocodingServiceTest {

    @Test
    @DisplayName("건물명이 있으면 건물명을 반환한다")
    void returns_building_name_when_available() {
        // given
        ReverseGeocodingClient client = mock(ReverseGeocodingClient.class);
        given(client.reverseGeocode(37.5665, 126.9780))
                .willReturn(new ReverseGeocodingResult(
                        "서울특별시청",
                        "서울특별시 중구 세종로 세종대로 110"
                ));

        // when
        ReverseGeocodeResponse response = new ReverseGeocodingService(client)
                .reverseGeocode(new ReverseGeocodeRequest(37.5665, 126.9780));

        // then
        assertThat(response.displayName()).isEqualTo("서울특별시청");
    }

    @Test
    @DisplayName("건물명이 없으면 도로명 주소를 반환한다")
    void returns_road_address_when_building_name_is_empty() {
        // given
        ReverseGeocodingClient client = mock(ReverseGeocodingClient.class);
        given(client.reverseGeocode(37.5665, 126.9780))
                .willReturn(new ReverseGeocodingResult(
                        "",
                        "서울특별시 중구 세종로 세종대로 110"
                ));

        // when
        ReverseGeocodeResponse response = new ReverseGeocodingService(client)
                .reverseGeocode(new ReverseGeocodeRequest(37.5665, 126.9780));

        // then
        assertThat(response.displayName()).isEqualTo("서울특별시 중구 세종로 세종대로 110");
    }

    @Test
    @DisplayName("도로명 주소가 없으면 지번 주소를 반환한다")
    void returns_lot_address_when_road_address_is_empty() {
        // given
        ReverseGeocodingClient client = mock(ReverseGeocodingClient.class);
        given(client.reverseGeocode(37.5665, 126.9780))
                .willReturn(new ReverseGeocodingResult(
                        "",
                        "",
                        "서울특별시 중구 태평로1가 110-1",
                        "서울특별시 중구 태평로1가"
                ));

        // when
        ReverseGeocodeResponse response = new ReverseGeocodingService(client)
                .reverseGeocode(new ReverseGeocodeRequest(37.5665, 126.9780));

        // then
        assertThat(response.displayName()).isEqualTo("서울특별시 중구 태평로1가 110-1");
    }

    @Test
    @DisplayName("도로명 주소와 지번 주소가 없으면 행정동 주소를 반환한다")
    void returns_administrative_address_when_detailed_addresses_are_empty() {
        // given
        ReverseGeocodingClient client = mock(ReverseGeocodingClient.class);
        given(client.reverseGeocode(37.5665, 126.9780))
                .willReturn(new ReverseGeocodingResult(
                        "",
                        "",
                        "",
                        "서울특별시 중구 태평로1가"
                ));

        // when
        ReverseGeocodeResponse response = new ReverseGeocodingService(client)
                .reverseGeocode(new ReverseGeocodeRequest(37.5665, 126.9780));

        // then
        assertThat(response.displayName()).isEqualTo("서울특별시 중구 태평로1가");
    }

    @Test
    @DisplayName("표시할 주소 정보가 모두 없으면 404 오류를 반환한다")
    void rejects_missing_reverse_geocoding_result() {
        // given
        ReverseGeocodingClient client = mock(ReverseGeocodingClient.class);
        given(client.reverseGeocode(37.5665, 126.9780))
                .willReturn(ReverseGeocodingResult.empty());

        // when & then
        assertThatThrownBy(() -> new ReverseGeocodingService(client)
                .reverseGeocode(new ReverseGeocodeRequest(37.5665, 126.9780)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.DESTINATION_REVERSE_GEOCODING_NOT_FOUND)
                );
    }
}
