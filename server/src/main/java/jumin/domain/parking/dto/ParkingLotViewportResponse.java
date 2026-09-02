package jumin.domain.parking.dto;

import jumin.domain.parking.entity.ParkingLot;

public record ParkingLotViewportResponse(
        Long id,
        double latitude,
        double longitude
) {
    public static ParkingLotViewportResponse from(ParkingLot parkingLot) {
        return new ParkingLotViewportResponse(
                parkingLot.getId(),
                parkingLot.getLatitude(),
                parkingLot.getLongitude()
        );
    }
}
