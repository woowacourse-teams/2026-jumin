package jumin.domain.parking.dto;

import jumin.domain.parking.entity.ParkingOperation;
import jumin.domain.parking.service.ParkingAvailabilityStatus;

public record ParkingLotDetailResponse(
        Long id,
        String name,
        String address,
        LocationResponse location,
        Integer capacity,
        Integer availableSpaces,
        Integer distanceMeters,
        Integer walkingDurationMinutes,
        Integer estimatedFee,
        String feeCalculationStatus,
        ParkingFeeRuleResponse feeRule,
        ParkingOperationResponse operation,
        long likeCount,
        boolean likedByMe
) {

    public static ParkingLotDetailResponse from(
            Long id,
            String name,
            String address,
            double latitude,
            double longitude,
            Integer capacity,
            Integer availableSpaces,
            Integer distanceMeters,
            Integer walkingDurationMinutes,
            Integer estimatedFee,
            ParkingOperation parkingOperation,
            ParkingAvailabilityStatus availabilityStatus,
            long likeCount,
            boolean likedByMe
    ) {
        return new ParkingLotDetailResponse(
                id,
                name,
                address,
                new LocationResponse(latitude, longitude),
                capacity,
                availableSpaces,
                distanceMeters,
                walkingDurationMinutes,
                estimatedFee,
                feeCalculationStatusOf(estimatedFee),
                ParkingFeeRuleResponse.from(parkingOperation),
                ParkingOperationResponse.from(parkingOperation, availabilityStatus),
                likeCount,
                likedByMe
        );
    }

    private static String feeCalculationStatusOf(Integer estimatedFee) {
        if (estimatedFee == null) {
            return "UNAVAILABLE";
        }
        return "CALCULATED";
    }

}
