package jumin.domain.admin.parking.dto;

import java.util.List;
import jumin.domain.parking.entity.ParkingLotReview;

public record AdminParkingLotReviewsResponse(
        List<AdminParkingLotReviewResponse> reviews
) {
    public static AdminParkingLotReviewsResponse from(List<ParkingLotReview> reviews) {
        return new AdminParkingLotReviewsResponse(
                reviews.stream()
                        .map(AdminParkingLotReviewResponse::from)
                        .toList()
        );
    }
}
