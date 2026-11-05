package jumin.domain.parking.dto;

public record ParkingLotViewportResponse(
        Long id,
        double latitude,
        double longitude,
        double score
) {
}
