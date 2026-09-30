package jumin.domain.admin.parking.dto;

import java.time.LocalDateTime;
import jumin.domain.parking.entity.ParkingLotReview;

public record AdminParkingLotReviewResponse(
        Long reviewId,
        Long parkingLotId,
        String parkingLotName,
        String parkingLotAddress,
        String detail,
        LocalDateTime createdAt
) {

    public static AdminParkingLotReviewResponse from(ParkingLotReview review) {
        return new AdminParkingLotReviewResponse(
                review.getId(),
                review.getParkingLot().getId(),
                review.getParkingLot().getName(),
                review.getParkingLot().getAddress(),
                review.getDetail(),
                review.getCreatedAt()
        );
    }
}
