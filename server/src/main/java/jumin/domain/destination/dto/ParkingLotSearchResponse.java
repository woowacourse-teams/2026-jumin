package jumin.domain.destination.dto;

import jumin.domain.parking.entity.ParkingLot;

public record ParkingLotSearchResponse(
        Long parkingLotId,
        String name,
        String address,
        double latitude,
        double longitude
) {

    public static ParkingLotSearchResponse from(ParkingLot parkingLot) {
        return new ParkingLotSearchResponse(
                parkingLot.getId(),
                parkingLot.getName(),
                parkingLot.getAddress(),
                parkingLot.getLatitude(),
                parkingLot.getLongitude()
        );
    }
}
