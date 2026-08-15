package jumin.domain.parking.dto;

import java.util.Optional;

public record ParkingLotResponse(
        Long id,
        String name,
        String address,
        LocationResponse location,
        Integer distanceMeters,
        Integer estimatedFee,
        Double balancedScore,
        String availabilityStatus
) {
    public static ParkingLotResponse from(
            Long id,
            String name,
            String address,
            double latitude,
            double longitude,
            Integer distanceMeters,
            Integer estimatedFee,
            Double balancedScore,
            String availabilityStatus
    ) {
        return new ParkingLotResponse(
                id,
                name,
                address,
                new LocationResponse(latitude, longitude),
                distanceMeters,
                estimatedFee,
                balancedScore,
                availabilityStatus
        );
    }

    public static ParkingLotResponse from(
            Long id,
            String name,
            String address,
            double latitude,
            double longitude,
            Integer distanceMeters,
            Optional<Integer> estimatedFee,
            Optional<Double> balancedScore,
            String availabilityStatus
    ) {
        return from(
                id,
                name,
                address,
                latitude,
                longitude,
                distanceMeters,
                estimatedFee.orElse(null),
                balancedScore.orElse(null),
                availabilityStatus
        );
    }

    record LocationResponse(double latitude, double longitude) {
    }
}
