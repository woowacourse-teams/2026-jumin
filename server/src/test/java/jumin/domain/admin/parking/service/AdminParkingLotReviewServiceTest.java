package jumin.domain.admin.parking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import jumin.domain.admin.parking.dto.AdminParkingLotReviewResponse;
import jumin.domain.admin.parking.dto.AdminParkingLotReviewsResponse;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parking.entity.ParkingLotReview;
import jumin.domain.parking.repository.ParkingLotReviewRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class AdminParkingLotReviewServiceTest {

    private final ParkingLotReviewRepository parkingLotReviewRepository = mock(ParkingLotReviewRepository.class);
    private final AdminParkingLotReviewService adminParkingLotReviewService =
            new AdminParkingLotReviewService(parkingLotReviewRepository);

    @Test
    @DisplayName("저장된 제보를 관리자 응답으로 변환한다")
    void returns_review_responses() {
        ParkingLot parkingLot = mock(ParkingLot.class);
        ParkingLotReview review = mock(ParkingLotReview.class);
        LocalDateTime createdAt = LocalDateTime.of(2026, 10, 1, 12, 34, 56);
        when(parkingLotReviewRepository.findAllByOrderByCreatedAtDesc()).thenReturn(List.of(review));
        when(review.getId()).thenReturn(101L);
        when(review.getParkingLot()).thenReturn(parkingLot);
        when(parkingLot.getId()).thenReturn(4L);
        when(parkingLot.getName()).thenReturn("주민 주차장");
        when(review.getDetail()).thenReturn(null);
        when(review.getCreatedAt()).thenReturn(createdAt);

        AdminParkingLotReviewsResponse response = adminParkingLotReviewService.getReviews();

        assertThat(response.reviews()).containsExactly(
                new AdminParkingLotReviewResponse(101L, 4L, "주민 주차장", null, createdAt)
        );
        verify(parkingLotReviewRepository).findAllByOrderByCreatedAtDesc();
    }
}
