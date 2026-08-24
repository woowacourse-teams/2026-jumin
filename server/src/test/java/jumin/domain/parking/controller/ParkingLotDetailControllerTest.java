package jumin.domain.parking.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jumin.domain.parking.dto.LocationResponse;
import jumin.domain.parking.dto.ParkingFeeRuleResponse;
import jumin.domain.parking.dto.ParkingLotDetailResponse;
import jumin.domain.parking.dto.ParkingOperationResponse;
import jumin.domain.parking.dto.ParkingScheduleResponse;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.domain.parking.service.ParkingLotDetailService;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@WebMvcTest(ParkingLotDetailController.class)
class ParkingLotDetailControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ParkingLotDetailService parkingLotDetailService;

    @Test
    @DisplayName("주차장 상세 조회 응답을 반환한다")
    void returns_parking_lot_detail_response() throws Exception {
        // given
        when(parkingLotDetailService.getDetail(any(Long.class), any(ParkingSearchRequest.class)))
                .thenReturn(detailResponse());

        // when
        ResultActions response = mockMvc.perform(validRequest(1L));

        // then
        response
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.capacity").value(42))
                .andExpect(jsonPath("$.distanceMeters").value(310))
                .andExpect(jsonPath("$.estimatedFee").value(6_000))
                .andExpect(jsonPath("$.feeCalculationStatus").value("CALCULATED"))
                .andExpect(jsonPath("$.feeRule.baseFreeMinutes").value(0))
                .andExpect(jsonPath("$.operation.availabilityStatus").value("AVAILABLE"))
                .andExpect(jsonPath("$.operation.weekday.openTime").value("00:00"))
                .andExpect(jsonPath("$.operation.weekend.paid").doesNotExist())
                .andExpect(jsonPath("$.operation.holiday.status").value("CLOSED"));
    }

    @Test
    @DisplayName("필수 상세 검색 조건이 누락되면 필드 오류와 400을 반환한다")
    void returns_bad_request_when_required_detail_condition_is_missing() throws Exception {
        // when
        ResultActions response = mockMvc.perform(get("/api/parking/1")
                .queryParam("destinationLongitude", "127.0279")
                .queryParam("entryAt", "2026-08-21T19:00:00+09:00")
                .queryParam("exitAt", "2026-08-21T20:00:00+09:00"));

        // then
        response
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("요청 값이 올바르지 않습니다."))
                .andExpect(jsonPath("$.errors[0].field").value("destinationLatitude"))
                .andExpect(jsonPath("$.errors[0].message").value("목적지 위도는 필수입니다."));
    }

    @Test
    @DisplayName("주차장이 없으면 상세 조회 전용 메시지와 404를 반환한다")
    void returns_not_found_when_parking_lot_does_not_exist() throws Exception {
        // given
        when(parkingLotDetailService.getDetail(any(Long.class), any(ParkingSearchRequest.class)))
                .thenThrow(new BusinessException(ErrorCode.PARKING_LOT_NOT_FOUND));

        // when
        ResultActions response = mockMvc.perform(validRequest(999L));

        // then
        response
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("주차장 정보를 찾을 수 없습니다."))
                .andExpect(jsonPath("$.errors").isEmpty());
    }

    private MockHttpServletRequestBuilder validRequest(long id) {
        return get("/api/parking/{parkingLotId}", id)
                .queryParam("destinationLatitude", "37.4981")
                .queryParam("destinationLongitude", "127.0279")
                .queryParam("entryAt", "2026-08-21T19:00:00+09:00")
                .queryParam("exitAt", "2026-08-21T20:00:00+09:00");
    }

    private ParkingLotDetailResponse detailResponse() {
        return new ParkingLotDetailResponse(
                1L,
                "역삼문화공원 제1호 공영주차장",
                "서울 강남구 테헤란로7길 21",
                new LocationResponse(37.4990, 127.0290),
                42,
                310,
                6_000,
                "CALCULATED",
                new ParkingFeeRuleResponse(0, 30, 3_000, 10, 1_000, 30_000),
                new ParkingOperationResponse(
                        "AVAILABLE",
                        new ParkingScheduleResponse("OPEN", "00:00", "00:00", true),
                        new ParkingScheduleResponse("OPEN", "09:00", "18:00", null),
                        new ParkingScheduleResponse("CLOSED", null, null, null)
                )
        );
    }
}
