package jumin.domain.admin.parking.controller;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDateTime;
import java.util.List;
import jumin.domain.admin.parking.dto.AdminParkingLotReviewResponse;
import jumin.domain.admin.parking.dto.AdminParkingLotReviewsResponse;
import jumin.domain.admin.parking.service.AdminParkingLotReviewService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(AdminParkingLotReviewController.class)
@AutoConfigureMockMvc(addFilters = false)
class AdminParkingLotReviewControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AdminParkingLotReviewService adminParkingLotReviewService;

    @Test
    @DisplayName("관리자 주차장 제보 목록을 조회한다")
    void returns_parking_lot_reviews() throws Exception {
        LocalDateTime createdAt = LocalDateTime.of(2026, 10, 1, 12, 34, 56);
        when(adminParkingLotReviewService.getReviews()).thenReturn(
                new AdminParkingLotReviewsResponse(List.of(
                        new AdminParkingLotReviewResponse(
                                101L,
                                4L,
                                "주민 주차장",
                                "행당로123",
                                "가격이 틀렸어요.",
                                createdAt
                        )
                ))
        );

        mockMvc.perform(get("/api/admin/parking/review"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.reviews[0].reviewId").value(101))
                .andExpect(jsonPath("$.reviews[0].parkingLotId").value(4))
                .andExpect(jsonPath("$.reviews[0].parkingLotName").value("주민 주차장"))
                .andExpect(jsonPath("$.reviews[0].parkingLotAddress").value("행당로123"))
                .andExpect(jsonPath("$.reviews[0].detail").value("가격이 틀렸어요."))
                .andExpect(jsonPath("$.reviews[0].createdAt").value("2026-10-01T12:34:56"));

        verify(adminParkingLotReviewService).getReviews();
    }

    @Test
    @DisplayName("제보가 없으면 빈 목록을 반환한다")
    void returns_empty_list_when_no_reviews_exist() throws Exception {
        when(adminParkingLotReviewService.getReviews()).thenReturn(
                new AdminParkingLotReviewsResponse(List.of())
        );

        mockMvc.perform(get("/api/admin/parking/review"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reviews").isEmpty());
    }
}
