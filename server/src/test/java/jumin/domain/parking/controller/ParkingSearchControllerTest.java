package jumin.domain.parking.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.domain.parking.dto.ParkingSearchResponse;
import jumin.domain.parking.dto.ParkingLotResponse;
import jumin.domain.parking.dto.LocationResponse;
import jumin.domain.parking.dto.ParkingViewportLotResponse;
import jumin.domain.parking.dto.ParkingViewportRequest;
import jumin.domain.parking.dto.ParkingViewportResponse;
import jumin.domain.parking.service.ParkingSearchService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.mockito.ArgumentCaptor;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@WebMvcTest(ParkingSearchController.class)
class ParkingSearchControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ParkingSearchService parkingSearchService;

    @Test
    @DisplayName("추천과 순위 필드가 없는 간결한 주차장 목록을 반환한다")
    void returns_compact_list_response_without_recommendation_or_rank_fields() throws Exception {
        // given
        ParkingSearchResponse result = ParkingSearchResponse.from(600, List.of(
                ParkingLotResponse.from(
                        1L, "시청 주차장", "서울 중구", 37.5665, 126.9780,
                        240, 2_000, 0.1250, "AVAILABLE"
                )
        ));
        when(parkingSearchService.search(any(ParkingSearchRequest.class))).thenReturn(result);

        // when
        ResultActions response = mockMvc.perform(get("/api/parking/search")
                        .queryParam("destinationLatitude", "37.5665")
                        .queryParam("destinationLongitude", "126.9780")
                        .queryParam("entryAt", "2026-08-14T10:00:00+09:00")
                        .queryParam("exitAt", "2026-08-14T11:00:00+09:00"));

        // then
        response
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.searchRadiusMeters").value(600))
                .andExpect(jsonPath("$.totalCount").value(1))
                .andExpect(jsonPath("$.parkingLots[0].id").value(1))
                .andExpect(jsonPath("$.parkingLots[0].name").value("시청 주차장"))
                .andExpect(jsonPath("$.parkingLots[0].address").value("서울 중구"))
                .andExpect(jsonPath("$.parkingLots[0].location.latitude").value(37.5665))
                .andExpect(jsonPath("$.parkingLots[0].location.longitude").value(126.9780))
                .andExpect(jsonPath("$.parkingLots[0].distanceMeters").value(240))
                .andExpect(jsonPath("$.parkingLots[0].estimatedFee").value(2_000))
                .andExpect(jsonPath("$.parkingLots[0].balancedScore").value(0.1250))
                .andExpect(jsonPath("$.parkingLots[0].availabilityStatus").value("AVAILABLE"))
                .andExpect(jsonPath("$.recommendedParkingLots").doesNotExist())
                .andExpect(jsonPath("$.searchCondition").doesNotExist())
                .andExpect(jsonPath("$.parkingLots[0].sortRanks").doesNotExist())
                .andExpect(jsonPath("$.parkingLots[0].operation").doesNotExist())
                .andExpect(jsonPath("$.parkingLots[0].feeCalculationStatus").doesNotExist())
                .andExpect(jsonPath("$.parkingLots[0].source").doesNotExist())
                .andExpect(jsonPath("$.parkingLots[0].sourceExternalId").doesNotExist());

        ArgumentCaptor<ParkingSearchRequest> requestCaptor = ArgumentCaptor.forClass(ParkingSearchRequest.class);
        verify(parkingSearchService).search(requestCaptor.capture());
        assertThat(requestCaptor.getValue().destinationLatitude()).isEqualTo(37.5665);
        assertThat(requestCaptor.getValue().destinationLongitude()).isEqualTo(126.9780);
        assertThat(requestCaptor.getValue().entryAt().toString()).isEqualTo("2026-08-14T10:00+09:00");
        assertThat(requestCaptor.getValue().exitAt().toString()).isEqualTo("2026-08-14T11:00+09:00");
    }

    @Test
    @DisplayName("요금과 균형점수가 없으면 null 필드를 유지한다")
    void preserves_nullable_result_fields() throws Exception {
        // given
        ParkingSearchResponse result = ParkingSearchResponse.from(600, List.of(
                ParkingLotResponse.from(
                        1L, "운영정보 확인 주차장", "서울 중구", 37.5665, 126.9780,
                        240, null, null, "UNKNOWN"
                )
        ));
        when(parkingSearchService.search(any(ParkingSearchRequest.class)))
                .thenReturn(result);

        // when
        ResultActions response = mockMvc.perform(get("/api/parking/search")
                .queryParam("destinationLatitude", "37.5665")
                .queryParam("destinationLongitude", "126.9780")
                .queryParam("entryAt", "2026-08-14T10:00:00+09:00")
                .queryParam("exitAt", "2026-08-14T11:00:00+09:00"));

        // then
        response
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.parkingLots[0].estimatedFee").value(nullValue()))
                .andExpect(jsonPath("$.parkingLots[0].balancedScore").value(nullValue()))
                .andExpect(jsonPath("$.parkingLots[0].availabilityStatus").value("UNKNOWN"));
    }

    @Test
    @DisplayName("관련 없는 쿼리 파라미터를 무시한다")
    void ignores_unrelated_query_parameters() throws Exception {
        // given
        when(parkingSearchService.search(any(ParkingSearchRequest.class)))
                .thenReturn(ParkingSearchResponse.from(600, List.of()));

        // when
        ResultActions response = mockMvc.perform(get("/api/parking/search")
                        .queryParam("destinationLatitude", "37.5665")
                        .queryParam("destinationLongitude", "126.9780")
                        .queryParam("entryAt", "2026-08-14T10:00:00+09:00")
                        .queryParam("exitAt", "2026-08-14T11:00:00+09:00")
                        .queryParam("searchRadiusMeters", "600"));

        // then
        response
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalCount").value(0));
    }

    @Test
    @DisplayName("필수 검색 파라미터가 누락되면 400을 반환한다")
    void rejects_request_when_required_search_parameter_is_missing() throws Exception {
        // given
        MockHttpServletRequestBuilder request = get("/api/parking/search")
                        .queryParam("destinationLongitude", "126.9780")
                        .queryParam("entryAt", "2026-08-14T10:00:00+09:00")
                        .queryParam("exitAt", "2026-08-14T11:00:00+09:00");

        // when
        ResultActions response = mockMvc.perform(request);

        // then
        response
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("destinationLatitude"))
                .andExpect(jsonPath("$.errors[0].message").value("목적지 위도는 필수입니다."));
    }

    @Test
    @DisplayName("좌표가 범위를 벗어나면 400을 반환한다")
    void rejects_request_when_coordinate_is_out_of_range() throws Exception {
        // given
        MockHttpServletRequestBuilder request = get("/api/parking/search")
                        .queryParam("destinationLatitude", "91")
                        .queryParam("destinationLongitude", "126.9780")
                        .queryParam("entryAt", "2026-08-14T10:00:00+09:00")
                        .queryParam("exitAt", "2026-08-14T11:00:00+09:00");

        // when
        ResultActions response = mockMvc.perform(request);

        // then
        response
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("destinationLatitude"))
                .andExpect(jsonPath("$.errors[0].message").value("목적지 위도는 90 이하이어야 합니다."));
    }

    @Test
    @DisplayName("경도가 범위를 벗어나면 400을 반환한다")
    void rejects_request_when_longitude_is_out_of_range() throws Exception {
        // given
        MockHttpServletRequestBuilder request = get("/api/parking/search")
                .queryParam("destinationLatitude", "37.5665")
                .queryParam("destinationLongitude", "181")
                .queryParam("entryAt", "2026-08-14T10:00:00+09:00")
                .queryParam("exitAt", "2026-08-14T11:00:00+09:00");

        // when
        ResultActions response = mockMvc.perform(request);

        // then
        response
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("destinationLongitude"))
                .andExpect(jsonPath("$.errors[0].message").value("목적지 경도는 180 이하이어야 합니다."));
    }

    @Test
    @DisplayName("유한하지 않은 좌표는 400을 반환한다")
    void rejects_request_when_coordinate_is_not_finite() throws Exception {
        // given
        MockHttpServletRequestBuilder request = get("/api/parking/search")
                        .queryParam("destinationLatitude", "NaN")
                        .queryParam("destinationLongitude", "126.9780")
                        .queryParam("entryAt", "2026-08-14T10:00:00+09:00")
                        .queryParam("exitAt", "2026-08-14T11:00:00+09:00");

        // when
        ResultActions response = mockMvc.perform(request);

        // then
        response
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("북서쪽과 남동쪽 좌표로 viewport 내 주차장 목록을 반환한다")
    void returns_parking_lots_in_viewport() throws Exception {
        // given
        ParkingViewportResponse result = new ParkingViewportResponse(
                1,
                List.of(new ParkingViewportLotResponse(
                        1L,
                        "시청 주차장",
                        "서울특별시 중구 세종대로 110",
                        new LocationResponse(37.5665, 126.9780)
                ))
        );
        when(parkingSearchService.searchViewport(any(ParkingViewportRequest.class))).thenReturn(result);

        // when
        MockHttpServletRequestBuilder request = get("/api/parking/viewport")
                .queryParam("westLongitude", "126.9700")
                .queryParam("southLatitude", "37.5600")
                .queryParam("eastLongitude", "126.9900")
                .queryParam("northLatitude", "37.5750");

        // then
        mockMvc.perform(request)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalCount").value(1))
                .andExpect(jsonPath("$.parkingLots[0].id").value(1))
                .andExpect(jsonPath("$.parkingLots[0].name").value("시청 주차장"))
                .andExpect(jsonPath("$.parkingLots[0].address").value("서울특별시 중구 세종대로 110"))
                .andExpect(jsonPath("$.parkingLots[0].location.latitude").value(37.5665))
                .andExpect(jsonPath("$.parkingLots[0].location.longitude").value(126.9780));

        verify(parkingSearchService).searchViewport(new ParkingViewportRequest(
                126.9700,
                37.5600,
                126.9900,
                37.5750
        ));
    }

    @Test
    @DisplayName("viewport 좌표가 누락되면 400 오류를 반환한다")
    void rejects_missing_viewport_coordinate() throws Exception {
        // when & then
        mockMvc.perform(get("/api/parking/viewport")
                .queryParam("westLongitude", "126.9700")
                .queryParam("southLatitude", "37.5600")
                .queryParam("eastLongitude", "126.9900"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("northLatitude"))
                .andExpect(jsonPath("$.errors[0].message").value("북쪽 위도는 필수입니다."));
    }

    @Test
    @DisplayName("북쪽 위도가 북극이면 400 오류를 반환한다")
    void rejects_north_pole_latitude() throws Exception {
        // when & then
        mockMvc.perform(get("/api/parking/viewport")
                .queryParam("westLongitude", "126.9700")
                .queryParam("southLatitude", "37.5600")
                .queryParam("eastLongitude", "126.9900")
                .queryParam("northLatitude", "90"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("northLatitude"))
                .andExpect(jsonPath("$.errors[0].message").value("북쪽 위도는 90보다 작아야 합니다."));
    }

    @Test
    @DisplayName("남쪽 위도가 남극이면 400 오류를 반환한다")
    void rejects_south_pole_latitude() throws Exception {
        // when & then
        mockMvc.perform(get("/api/parking/viewport")
                .queryParam("westLongitude", "126.9700")
                .queryParam("southLatitude", "-90")
                .queryParam("eastLongitude", "126.9900")
                .queryParam("northLatitude", "37.5750"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("southLatitude"))
                .andExpect(jsonPath("$.errors[0].message").value("남쪽 위도는 -90보다 커야 합니다."));
    }
}
