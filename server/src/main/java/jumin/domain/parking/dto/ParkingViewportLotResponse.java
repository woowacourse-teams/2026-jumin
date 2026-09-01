package jumin.domain.parking.dto;

import jumin.domain.parking.entity.ParkingLot;

public record ParkingViewportLotResponse(
        Long id,
        String name,
        String address,
        LocationResponse location
) {
    public static ParkingViewportLotResponse from(ParkingLot parkingLot) {
        return new ParkingViewportLotResponse(
                parkingLot.getId(),
                parkingLot.getName(),
                parkingLot.getAddress(),
                new LocationResponse(parkingLot.getLatitude(), parkingLot.getLongitude())
        );
    }
}
