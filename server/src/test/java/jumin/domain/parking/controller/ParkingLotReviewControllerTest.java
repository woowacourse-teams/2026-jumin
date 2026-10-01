package jumin.domain.parking.controller;

import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jumin.domain.parking.dto.ParkingReviewRequest;
import jumin.domain.parking.service.ParkingLotReviewService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ParkingLotReviewController.class)
@AutoConfigureMockMvc(addFilters = false)
class ParkingLotReviewControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ParkingLotReviewService parkingLotReviewService;

    @Test
    @DisplayName("제보 내용을 생략해도 주차장 제보를 생성한다")
    void creates_review_without_optional_detail() throws Exception {
        mockMvc.perform(post("/api/parking/review")
                        .contentType("application/json")
                        .content("{\"parkingLotId\":123}"))
                .andExpect(status().isCreated());

        verify(parkingLotReviewService).create(new ParkingReviewRequest(123L, null));
    }

    @Test
    @DisplayName("입력한 제보 내용으로 제보를 생성한다")
    void creates_review_with_detail() throws Exception {
        mockMvc.perform(post("/api/parking/review")
                        .contentType("application/json")
                        .content("{\"parkingLotId\":123,\"detail\":\"주말에는 무료예요.\"}"))
                .andExpect(status().isCreated());

        verify(parkingLotReviewService).create(new ParkingReviewRequest(123L, "주말에는 무료예요."));
    }

    @Test
    @DisplayName("주차장 ID가 없으면 400을 반환한다")
    void returns_bad_request_when_parking_lot_id_is_missing() throws Exception {
        mockMvc.perform(post("/api/parking/review")
                        .contentType("application/json")
                        .content("{\"detail\":\"요금 정보가 잘못됐어요.\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("parkingLotId"));
    }

    @Test
    @DisplayName("제보 내용이 500자를 넘으면 400을 반환한다")
    void returns_bad_request_when_detail_exceeds_max_length() throws Exception {
        String detail = "가".repeat(501);

        mockMvc.perform(post("/api/parking/review")
                        .contentType("application/json")
                        .content("{\"parkingLotId\":123,\"detail\":\"" + detail + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("detail"));
    }
}
