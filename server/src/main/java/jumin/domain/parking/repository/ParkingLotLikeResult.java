package jumin.domain.parking.repository;

public record ParkingLotLikeResult(
        long likeCount,
        boolean likedByMe
) {
}
