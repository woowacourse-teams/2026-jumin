package jumin.domain.destination;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import jumin.domain.destination.controller.DestinationController;
import jumin.domain.destination.dto.DestinationResponse;
import jumin.domain.destination.dto.DestinationsResponse;
import jumin.domain.destination.dto.ReverseGeocodeRequest;
import jumin.domain.destination.dto.ReverseGeocodeResponse;
import jumin.domain.destination.service.DestinationService;
import jumin.domain.destination.service.ReverseGeocodingService;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(DestinationController.class)
class DestinationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private DestinationService destinationService;

    @MockitoBean
    private ReverseGeocodingService reverseGeocodingService;

    @Test
    @DisplayName("목적지 검색 결과를 명세 필드로 반환한다")
    void returns_destination_search_response() throws Exception {
        // given
        given(destinationService.search("강남")).willReturn(DestinationsResponse.from(
                "강남",
                List.of(DestinationResponse.from(
                        "naver_12345",
                        "강남역 11번 출구",
                        "서울 강남구 역삼동 858",
                        "서울 강남구 강남대로 396",
                        37.4981,
                        127.0279
                ))
        ));

        // when & then
        mockMvc.perform(get("/api/destinations/search").queryParam("query", "강남"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.query").value("강남"))
                .andExpect(jsonPath("$.destinations[0].destinationId").value("naver_12345"))
                .andExpect(jsonPath("$.destinations[0].name").value("강남역 11번 출구"))
                .andExpect(jsonPath("$.destinations[0].address").value("서울 강남구 역삼동 858"))
                .andExpect(jsonPath("$.destinations[0].roadAddress").value("서울 강남구 강남대로 396"))
                .andExpect(jsonPath("$.destinations[0].latitude").value(37.4981))
                .andExpect(jsonPath("$.destinations[0].longitude").value(127.0279))
                .andExpect(jsonPath("$.destinations[0].provider").value("NAVER"));
    }

    @Test
    @DisplayName("검색어가 없으면 공통 예외 형식으로 400을 반환한다")
    void rejects_missing_query() throws Exception {
        // given
        given(destinationService.search(null)).willThrow(
                new BusinessException(ErrorCode.INVALID_QUERY)
        );

        // when & then
        mockMvc.perform(get("/api/destinations/search"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("검색어는 2자 이상 입력해 주세요."))
                .andExpect(jsonPath("$.errors").isEmpty());
    }

    @Test
    @DisplayName("중앙 좌표의 건물명 또는 도로명 주소를 반환한다")
    void returns_reverse_geocoded_display_name() throws Exception {
        // given
        ReverseGeocodeRequest request = new ReverseGeocodeRequest(37.5665, 126.9780);
        given(reverseGeocodingService.reverseGeocode(request))
                .willReturn(new ReverseGeocodeResponse("서울특별시청"));

        // when & then
        mockMvc.perform(get("/api/destinations/reverse-geocode")
                        .queryParam("latitude", "37.5665")
                        .queryParam("longitude", "126.9780"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("서울특별시청"));
    }

    @Test
    @DisplayName("역지오코딩 결과가 없으면 404를 반환한다")
    void rejects_missing_reverse_geocoding_result() throws Exception {
        // given
        ReverseGeocodeRequest request = new ReverseGeocodeRequest(37.5665, 126.9780);
        given(reverseGeocodingService.reverseGeocode(request))
                .willThrow(new BusinessException(ErrorCode.DESTINATION_REVERSE_GEOCODING_NOT_FOUND));

        // when & then
        mockMvc.perform(get("/api/destinations/reverse-geocode")
                      .queryParam("latitude", "37.5665")
                      .queryParam("longitude", "126.9780"))
              .andExpect(status().isNotFound())
              .andExpect(jsonPath("$.message").value("목적지 위치 정보를 찾을 수 없습니다."));
    }

    @Test
    @DisplayName("역지오코딩 요청의 좌표가 범위를 벗어나면 400을 반환한다")
    void rejects_invalid_reverse_geocoding_coordinates() throws Exception {
        // when & then
        mockMvc.perform(get("/api/destinations/reverse-geocode")
                        .queryParam("latitude", "91")
                        .queryParam("longitude", "126.9780"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("요청 값이 올바르지 않습니다."));
    }

    @Test
    @DisplayName("역지오코딩 요청의 좌표가 누락되거나 숫자가 아니면 400을 반환한다")
    void rejects_missing_or_non_numeric_reverse_geocoding_coordinates() throws Exception {
        // when & then
        mockMvc.perform(get("/api/destinations/reverse-geocode")
                        .queryParam("longitude", "126.9780"))
                .andExpect(status().isBadRequest());

        // when & then
        mockMvc.perform(get("/api/destinations/reverse-geocode")
                        .queryParam("latitude", "not-a-number")
                        .queryParam("longitude", "126.9780"))
                .andExpect(status().isBadRequest());
    }
}
