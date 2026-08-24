package jumin.domain.parking.dto;

import jumin.domain.parking.entity.ParkingOperation;
import jumin.domain.parking.service.ParkingAvailabilityStatus;

public record ParkingLotDetailResponse(
        Long id,
        String name,
        String address,
        LocationResponse location,
        Integer capacity,
        Integer distanceMeters,
        Integer estimatedFee,
        String feeCalculationStatus,
        ParkingFeeRuleResponse feeRule,
        ParkingOperationResponse operation
) {

    public static ParkingLotDetailResponse from(
            Long id,
            String name,
            String address,
            double latitude,
            double longitude,
            Integer capacity,
            int distanceMeters,
            Integer estimatedFee,
            ParkingOperation parkingOperation,
            ParkingAvailabilityStatus availabilityStatus
    ) {
        return new ParkingLotDetailResponse(
                id,
                name,
                address,
                new LocationResponse(latitude, longitude),
                capacity,
                distanceMeters,
                estimatedFee,
                feeCalculationStatusOf(estimatedFee),
                ParkingFeeRuleResponse.from(parkingOperation),
                ParkingOperationResponse.from(parkingOperation, availabilityStatus)
        );
    }

    private static String feeCalculationStatusOf(Integer estimatedFee) {
        if (estimatedFee == null) {
            return "UNAVAILABLE";
        }
        return "CALCULATED";
    }

}
