package jumin.domain.parking.controller;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import jumin.domain.parking.dto.ParkingLikeResponse;
import jumin.domain.parking.service.ParkingLotLikeService;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ParkingLotLikeController.class)
@AutoConfigureMockMvc(addFilters = false)
class ParkingLotLikeControllerTest {

    private static final String GUEST_ID = "550e8400-e29b-41d4-a716-446655440000";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ParkingLotLikeService parkingLotLikeService;

    @ParameterizedTest
    @ValueSource(strings = {"PUT", "DELETE"})
    @DisplayName("게스트 ID의 대소문자와 관계없이 좋아요 상태를 반환한다")
    void returns_state_for_canonical_guest_id(String method) throws Exception {
        UUID guestId = UUID.fromString(GUEST_ID);
        boolean liked = method.equals("PUT");
        if (liked) {
            when(parkingLotLikeService.like(123L, guestId))
                    .thenReturn(new ParkingLikeResponse(123L, 2, true));
        } else {
            when(parkingLotLikeService.unlike(123L, guestId))
                    .thenReturn(new ParkingLikeResponse(123L, 1, false));
        }

        mockMvc.perform(request(HttpMethod.valueOf(method), "/api/parking/123/like")
                        .header("X-Guest-Id", GUEST_ID.toUpperCase()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.parkingLotId").value(123))
                .andExpect(jsonPath("$.likeCount").value(liked ? 2 : 1))
                .andExpect(jsonPath("$.likedByMe").value(liked));

        if (liked) {
            verify(parkingLotLikeService).like(123L, guestId);
        } else {
            verify(parkingLotLikeService).unlike(123L, guestId);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"PUT", "DELETE"})
    @DisplayName("요청 값이 올바르지 않으면 좋아요를 변경하지 않고 400을 반환한다")
    void rejects_invalid_requests_before_mutation(String method) throws Exception {
        for (String invalidGuestId : new String[]{
                "", " ", "not-a-uuid", "1-1-4-8-1",
                "550e8400-e29b-11d4-a716-446655440000",
                "550e8400-e29b-41d4-7716-446655440000", GUEST_ID + " "
        }) {
            mockMvc.perform(request(HttpMethod.valueOf(method), "/api/parking/123/like")
                            .header("X-Guest-Id", invalidGuestId))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message").value("요청 값이 올바르지 않습니다."))
                    .andExpect(jsonPath("$.errors").isArray());
        }
        mockMvc.perform(request(HttpMethod.valueOf(method), "/api/parking/123/like"))
                .andExpect(status().isBadRequest());

        for (String invalidLotId : new String[]{"0", "-1", "bad", "9223372036854775808"}) {
            mockMvc.perform(request(HttpMethod.valueOf(method), "/api/parking/" + invalidLotId + "/like")
                            .header("X-Guest-Id", GUEST_ID))
                    .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(parkingLotLikeService);
    }

    @ParameterizedTest
    @ValueSource(strings = {"PUT", "DELETE"})
    @DisplayName("주차장이 없으면 공통 오류 형식으로 404를 반환한다")
    void returns_common_not_found_response(String method) throws Exception {
        var exception = new BusinessException(ErrorCode.PARKING_LOT_NOT_FOUND);
        if (method.equals("PUT")) {
            when(parkingLotLikeService.like(123L, UUID.fromString(GUEST_ID))).thenThrow(exception);
        } else {
            when(parkingLotLikeService.unlike(123L, UUID.fromString(GUEST_ID))).thenThrow(exception);
        }
        mockMvc.perform(request(HttpMethod.valueOf(method), "/api/parking/123/like")
                        .header("X-Guest-Id", GUEST_ID))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("주차장 정보를 찾을 수 없습니다."))
                .andExpect(jsonPath("$.errors").isEmpty());
    }
}
