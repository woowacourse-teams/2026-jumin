package jumin.domain.parking.service;

import org.springframework.stereotype.Component;

@Component
public class ParkingBalancedScoreCalculator {

    private static final int DISTANCE_REFERENCE_METERS = 600;
    private static final int FEE_PER_10_MINUTES = 1_500;
    private static final int REFERENCE_MINUTES = 10;
    private static final double SCORE_ROUNDING_FACTOR = 10_000d;

    public Double calculate(
            ParkingAvailabilityStatus availabilityStatus,
            int distanceMeters,
            Integer estimatedFee,
            int durationMinutes
    ) {
        if (availabilityStatus != ParkingAvailabilityStatus.AVAILABLE || estimatedFee == null) {
            return null;
        }

        double referenceFee = (double) durationMinutes * FEE_PER_10_MINUTES / REFERENCE_MINUTES;
        double distanceScore = normalize(distanceMeters, DISTANCE_REFERENCE_METERS);
        double feeScore = normalize(estimatedFee, referenceFee);
        return round((distanceScore + feeScore) / 2);
    }

    private double normalize(int value, double reference) {
        return Math.min(Math.max(value / reference, 0d), 1d);
    }

    private double round(double value) {
        return Math.round(value * SCORE_ROUNDING_FACTOR) / SCORE_ROUNDING_FACTOR;
    }
}
