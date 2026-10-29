package jumin.domain.parking.controller;

import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@WebMvcTest(ParkingLotDetailController.class)
@AutoConfigureMockMvc(addFilters = false)
class ParkingLotDetailControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ParkingLotDetailService parkingLotDetailService;

    private static final String GUEST_ID = "550e8400-e29b-41d4-a716-446655440000";

    @Test
    @DisplayName("주차장 상세 조회 응답을 반환한다")
    void returns_parking_lot_detail_response() throws Exception {
        // given
        when(parkingLotDetailService.getDetail(
                any(Long.class), any(ParkingSearchRequest.class), any(UUID.class)
        ))
                .thenReturn(detailResponse(310, 5, 8));

        // when
        ResultActions response = mockMvc.perform(validRequest(1L));

        // then
        response
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.capacity").value(42))
                .andExpect(jsonPath("$.availableSpaces").value(8))
                .andExpect(jsonPath("$.likeCount").value(3))
                .andExpect(jsonPath("$.likedByMe").value(true))
                .andExpect(jsonPath("$.distanceMeters").value(310))
                .andExpect(jsonPath("$.walkingDurationMinutes").value(5))
                .andExpect(jsonPath("$.estimatedFee").value(6_000))
                .andExpect(jsonPath("$.feeCalculationStatus").value("CALCULATED"))
                .andExpect(jsonPath("$.feeRule.baseFreeMinutes").value(0))
                .andExpect(jsonPath("$.operation.availabilityStatus").value("AVAILABLE"))
                .andExpect(jsonPath("$.operation.weekday.openTime").value("00:00"))
                .andExpect(jsonPath("$.operation.weekend.paid").doesNotExist())
                .andExpect(jsonPath("$.operation.holiday.status").value("CLOSED"));
    }

    @Test
    @DisplayName("만차인 주차장의 잔여석은 0으로 반환하고 운영 가능 상태를 유지한다")
    void returns_zero_available_spaces_for_full_parking_lot() throws Exception {
        // given
        when(parkingLotDetailService.getDetail(
                any(Long.class), any(ParkingSearchRequest.class), any(UUID.class)
        ))
                .thenReturn(detailResponse(310, 5, 0));

        // when
        ResultActions response = mockMvc.perform(validRequest(1L));

        // then
        response
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.availableSpaces").value(0))
                .andExpect(jsonPath("$.capacity").value(42))
                .andExpect(jsonPath("$.operation.availabilityStatus").value("AVAILABLE"));
    }

    @Test
    @DisplayName("제공할 잔여석이 없으면 필드를 생략하지 않고 null과 기존 상세 정보를 반환한다")
    void returns_explicit_null_available_spaces_when_unavailable() throws Exception {
        // given
        when(parkingLotDetailService.getDetail(
                any(Long.class), any(ParkingSearchRequest.class), any(UUID.class)
        ))
                .thenReturn(detailResponse(310, 5, null));

        // when
        ResultActions response = mockMvc.perform(validRequest(1L));

        // then
        response
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.availableSpaces").hasJsonPath())
                .andExpect(jsonPath("$.availableSpaces").value(nullValue()))
                .andExpect(jsonPath("$.capacity").value(42))
                .andExpect(jsonPath("$.estimatedFee").value(6_000))
                .andExpect(jsonPath("$.operation.availabilityStatus").value("AVAILABLE"));
    }

    @Test
    @DisplayName("필수 상세 검색 조건이 누락되면 필드 오류와 400을 반환한다")
    void returns_bad_request_when_required_detail_condition_is_missing() throws Exception {
        // when
        ResultActions response = mockMvc.perform(get("/api/parking/1")
                .header("X-Guest-Id", GUEST_ID)
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
        when(parkingLotDetailService.getDetail(
                any(Long.class), any(ParkingSearchRequest.class), any(UUID.class)
        ))
                .thenThrow(new BusinessException(ErrorCode.PARKING_LOT_NOT_FOUND));

        // when
        ResultActions response = mockMvc.perform(validRequest(999L));

        // then
        response
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("주차장 정보를 찾을 수 없습니다."))
                .andExpect(jsonPath("$.errors").isEmpty());
    }

    @Test
    @DisplayName("도보 경로가 없어도 거리와 소요 시간이 null인 상세 응답과 200을 반환한다")
    void returns_detail_with_null_distance_and_duration_when_walking_route_does_not_exist() throws Exception {
        // given
        when(parkingLotDetailService.getDetail(
                any(Long.class), any(ParkingSearchRequest.class), any(UUID.class)
        ))
                .thenReturn(detailResponse(null, null, 8));

        // when
        ResultActions response = mockMvc.perform(validRequest(1L));

        // then
        response
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.name").value("역삼문화공원 제1호 공영주차장"))
                .andExpect(jsonPath("$.availableSpaces").value(8))
                .andExpect(jsonPath("$.distanceMeters").hasJsonPath())
                .andExpect(jsonPath("$.distanceMeters").value(nullValue()))
                .andExpect(jsonPath("$.walkingDurationMinutes").hasJsonPath())
                .andExpect(jsonPath("$.walkingDurationMinutes").value(nullValue()))
                .andExpect(jsonPath("$.estimatedFee").value(6_000))
                .andExpect(jsonPath("$.feeCalculationStatus").value("CALCULATED"))
                .andExpect(jsonPath("$.feeRule.baseFee").value(3_000))
                .andExpect(jsonPath("$.operation.availabilityStatus").value("AVAILABLE"))
                .andExpect(jsonPath("$.operation.weekday.openTime").value("00:00"));
    }

    @Test
    @DisplayName("보행망이 준비되지 않으면 보행 네트워크 사용 불가 메시지와 503을 반환한다")
    void returns_service_unavailable_when_walking_network_is_unavailable() throws Exception {
        // given
        when(parkingLotDetailService.getDetail(
                any(Long.class), any(ParkingSearchRequest.class), any(UUID.class)
        ))
                .thenThrow(new BusinessException(ErrorCode.WALKING_NETWORK_UNAVAILABLE));

        // when
        ResultActions response = mockMvc.perform(validRequest(1L));

        // then
        response
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value("보행 네트워크를 사용할 수 없습니다."))
                .andExpect(jsonPath("$.errors").isEmpty());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "not-a-uuid",
            "550e8400-e29b-11d4-a716-446655440000",
            "550e8400-e29b-41d4-7716-446655440000"
    })
    @DisplayName("게스트 ID가 UUID v4가 아니면 400을 반환한다")
    void rejects_invalid_guest_id(String guestId) throws Exception {
        mockMvc.perform(validRequestWithoutGuestId(1L).header("X-Guest-Id", guestId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("요청 값이 올바르지 않습니다."));
    }

    @Test
    @DisplayName("게스트 ID가 없으면 400을 반환한다")
    void rejects_missing_guest_id() throws Exception {
        mockMvc.perform(get("/api/parking/{parkingLotId}", 1L)
                        .queryParam("destinationLatitude", "37.4981")
                        .queryParam("destinationLongitude", "127.0279")
                        .queryParam("entryAt", "2026-08-21T19:00:00+09:00")
                        .queryParam("exitAt", "2026-08-21T20:00:00+09:00"))
                .andExpect(status().isBadRequest());
    }

    private MockHttpServletRequestBuilder validRequest(long id) {
        return validRequestWithoutGuestId(id)
                .header("X-Guest-Id", GUEST_ID);
    }

    private MockHttpServletRequestBuilder validRequestWithoutGuestId(long id) {
        return get("/api/parking/{parkingLotId}", id)
                .queryParam("destinationLatitude", "37.4981")
                .queryParam("destinationLongitude", "127.0279")
                .queryParam("entryAt", "2026-08-21T19:00:00+09:00")
                .queryParam("exitAt", "2026-08-21T20:00:00+09:00");
    }

    private ParkingLotDetailResponse detailResponse(
            Integer distanceMeters, Integer walkingDurationMinutes, Integer availableSpaces
    ) {
        return new ParkingLotDetailResponse(
                1L,
                "역삼문화공원 제1호 공영주차장",
                "서울 강남구 테헤란로7길 21",
                new LocationResponse(37.4990, 127.0290),
                42,
                availableSpaces,
                distanceMeters,
                walkingDurationMinutes,
                6_000,
                "CALCULATED",
                new ParkingFeeRuleResponse(0, 30, 3_000, 10, 1_000, 30_000),
                new ParkingOperationResponse(
                        "AVAILABLE",
                        new ParkingScheduleResponse("OPEN", "00:00", "00:00", true),
                        new ParkingScheduleResponse("OPEN", "09:00", "18:00", null),
                        new ParkingScheduleResponse("CLOSED", null, null, null)
                ),
                3L,
                true
        );
    }
}
