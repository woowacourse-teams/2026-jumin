package jumin.domain.parking.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.domain.parking.dto.ParkingSearchResponse;
import jumin.domain.parking.dto.ParkingLotResponse;
import jumin.domain.parking.service.ParkingSearchService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
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
        when(parkingSearchService.search(org.mockito.ArgumentMatchers.any(ParkingSearchRequest.class))).thenReturn(result);

        // when
        ResultActions response = mockMvc.perform(get("/api/parking-lots/search")
                        .queryParam("destinationLatitude", "37.5665")
                        .queryParam("destinationLongitude", "126.9780")
                        .queryParam("entryAt", "2026-08-14T10:00:00+09:00")
                        .queryParam("exitAt", "2026-08-14T11:00:00+09:00"));

        // then
        response
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.searchRadiusMeters").value(600))
                .andExpect(jsonPath("$.totalCount").value(1))
                .andExpect(jsonPath("$.parkingLots[0].balancedScore").value(0.1250))
                .andExpect(jsonPath("$.parkingLots[0].availabilityStatus").value("AVAILABLE"))
                .andExpect(jsonPath("$.recommendedParkingLots").doesNotExist())
                .andExpect(jsonPath("$.searchCondition").doesNotExist())
                .andExpect(jsonPath("$.parkingLots[0].sortRanks").doesNotExist());
    }

    @Test
    @DisplayName("관련 없는 쿼리 파라미터를 무시한다")
    void ignores_unrelated_query_parameters() throws Exception {
        // given
        when(parkingSearchService.search(org.mockito.ArgumentMatchers.any(ParkingSearchRequest.class)))
                .thenReturn(ParkingSearchResponse.from(600, List.of()));

        // when
        ResultActions response = mockMvc.perform(get("/api/parking-lots/search")
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
        MockHttpServletRequestBuilder request = get("/api/parking-lots/search")
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
        MockHttpServletRequestBuilder request = get("/api/parking-lots/search")
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
    @DisplayName("유한하지 않은 좌표는 400을 반환한다")
    void rejects_request_when_coordinate_is_not_finite() throws Exception {
        // given
        MockHttpServletRequestBuilder request = get("/api/parking-lots/search")
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
}
