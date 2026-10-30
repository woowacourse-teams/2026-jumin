package jumin.domain.destination;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import jumin.domain.destination.controller.DestinationController;
import jumin.domain.destination.dto.DestinationResponse;
import jumin.domain.destination.dto.DestinationSearchRequest;
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
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@WebMvcTest(DestinationController.class)
@AutoConfigureMockMvc(addFilters = false)
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
        DestinationSearchRequest searchRequest = new DestinationSearchRequest("강남", null, null);
        given(destinationService.search(searchRequest)).willReturn(
                DestinationsResponse.from(
                        "강남",
                        List.of(DestinationResponse.from(
                                "kakao_12345",
                                "강남역 11번 출구",
                                "서울 강남구 역삼동 858",
                                "서울 강남구 강남대로 396",
                                37.4981,
                                127.0279
                        ))
                )
        );

        // when & then
        mockMvc.perform(get("/api/destinations/search").queryParam("query", "강남"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.query").value("강남"))
                .andExpect(jsonPath("$.destinations[0].destinationId").value("kakao_12345"))
                .andExpect(jsonPath("$.destinations[0].name").value("강남역 11번 출구"))
                .andExpect(jsonPath("$.destinations[0].address").value("서울 강남구 역삼동 858"))
                .andExpect(jsonPath("$.destinations[0].roadAddress").value("서울 강남구 강남대로 396"))
                .andExpect(jsonPath("$.destinations[0].latitude").value(37.4981))
                .andExpect(jsonPath("$.destinations[0].longitude").value(127.0279))
                .andExpect(jsonPath("$.destinations[0].provider").value("KAKAO"));
    }

    @Test
    @DisplayName("검색어가 없으면 공통 예외 형식으로 400을 반환한다")
    void rejects_missing_query() throws Exception {
        // given
        DestinationSearchRequest searchRequest = new DestinationSearchRequest(null, null, null);
        given(destinationService.search(searchRequest))
                .willThrow(new BusinessException(ErrorCode.INVALID_QUERY));

        // when & then
        mockMvc.perform(get("/api/destinations/search"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("검색어는 2자 이상 입력해 주세요."))
                .andExpect(jsonPath("$.errors").isEmpty());
    }

    @Test
    @DisplayName("원문 검색어와 위치 좌표를 서비스에 전달한다")
    void passes_location_without_rewriting_query() throws Exception {
        DestinationSearchRequest searchRequest = new DestinationSearchRequest("에버랜드", 37.395, 127.111);
        given(destinationService.search(searchRequest)).willReturn(
                DestinationsResponse.from("에버랜드", List.of()));
        mockMvc.perform(get("/api/destinations/search").param("query", "에버랜드")
                        .param("latitude", "37.395").param("longitude", "127.111"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.query").value("에버랜드"))
                .andExpect(jsonPath("$.destinations").isEmpty());
    }

    @Test
    @DisplayName("위경도가 일부 누락되거나 유효하지 않으면 400을 반환한다")
    void rejects_partial_or_invalid_coordinates() throws Exception {
        for (String[] invalidCoordinatePair : new String[][]{{"37", ""}, {"", "127"}, {"91", "127"},
                {"37", "181"}, {"NaN", "127"}, {"Infinity", "127"}}) {
            String latitude = invalidCoordinatePair[0];
            String longitude = invalidCoordinatePair[1];
            MockHttpServletRequestBuilder searchRequestBuilder = get("/api/destinations/search")
                    .param("query", "강남");
            if (!latitude.isEmpty()) {
                searchRequestBuilder.param("latitude", latitude);
            }
            if (!longitude.isEmpty()) {
                searchRequestBuilder.param("longitude", longitude);
            }
            mockMvc.perform(searchRequestBuilder).andExpect(status().isBadRequest());
        }
    }

    @Test
    @DisplayName("중앙 좌표의 건물명 또는 도로명 주소를 반환한다")
    void returns_reverse_geocoded_display_name() throws Exception {
        // given
        ReverseGeocodeRequest reverseGeocodeRequest = new ReverseGeocodeRequest(37.5665, 126.9780);
        given(reverseGeocodingService.reverseGeocode(reverseGeocodeRequest))
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
        ReverseGeocodeRequest reverseGeocodeRequest = new ReverseGeocodeRequest(37.5665, 126.9780);
        given(reverseGeocodingService.reverseGeocode(reverseGeocodeRequest))
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
