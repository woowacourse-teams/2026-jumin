package jumin.domain.parking.dto;

import jumin.domain.parking.entity.ParkingLot;

public record ParkingLotViewportResponse(
        Long id,
        double latitude,
        double longitude,
        double score
) {
    public static ParkingLotViewportResponse from(ParkingLot parkingLot, double score) {
        return new ParkingLotViewportResponse(
                parkingLot.getId(),
                parkingLot.getLatitude(),
                parkingLot.getLongitude(),
                score
        );
    }
}
