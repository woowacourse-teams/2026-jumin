package jumin.domain.parking.dto;

public record ParkingLikeResponse(
        Long parkingLotId,
        long likeCount,
        boolean likedByMe
) {
}
