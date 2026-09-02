package jumin.domain.parking.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import jumin.domain.parking.dto.LocationResponse;
import jumin.domain.parking.dto.ParkingViewportLotResponse;
import jumin.domain.parking.dto.ParkingViewportRequest;
import jumin.domain.parking.dto.ParkingViewportResponse;
import jumin.domain.parking.service.ParkingViewportService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@WebMvcTest(ParkingViewportController.class)
class ParkingViewportControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ParkingViewportService parkingViewportService;

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
        when(parkingViewportService.search(any(ParkingViewportRequest.class))).thenReturn(result);

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

        verify(parkingViewportService).search(new ParkingViewportRequest(
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
