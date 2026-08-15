package jumin.domain.parking.service;

import java.util.Optional;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.domain.parking.dto.ParkingLotResponse;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parking.entity.ParkingOperation;
import jumin.domain.parking.repository.ParkingOperationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ParkingSearchResultCalculator {

    private static final int DISTANCE_REFERENCE_METERS = 600;
    private static final int FEE_PER_10_MINUTES = 1_500;
    private static final int REFERENCE_MINUTES = 10;
    private static final double SCORE_ROUNDING_FACTOR = 10_000d;

    private final ParkingOperationRepository parkingOperationRepository;
    private final ParkingOperationEvaluator operationEvaluator;
    private final GeoDistanceCalculator geoDistanceCalculator;

    ParkingLotResponse calculate(
            ParkingLot parkingLot,
            Coordinate destination,
            ParkingSearchRequest request,
            int durationMinutes
    ) {
        Optional<ParkingOperation> operation = parkingOperationRepository.findById(parkingLot.getId());
        ParkingAvailabilityStatus status = operation
                .map(currentOperation -> operationEvaluator.evaluate(
                        currentOperation,
                        request.entryAt(),
                        request.exitAt()
                ))
                .orElse(ParkingAvailabilityStatus.UNKNOWN);
        Optional<Integer> estimatedFee = calculateFee(operation, status, durationMinutes);

        Coordinate parkingLocation = new Coordinate(parkingLot.getLatitude(), parkingLot.getLongitude());
        int distanceMeters = geoDistanceCalculator.distanceMeters(destination, parkingLocation);
        Optional<Double> balancedScore = calculateScore(status, distanceMeters, estimatedFee, durationMinutes);

        return ParkingLotResponse.from(
                parkingLot.getId(),
                parkingLot.getName(),
                parkingLot.getAddress(),
                parkingLot.getLatitude(),
                parkingLot.getLongitude(),
                distanceMeters,
                estimatedFee,
                balancedScore,
                status.name()
        );
    }

    private Optional<Integer> calculateFee(
            Optional<ParkingOperation> operation,
            ParkingAvailabilityStatus status,
            int durationMinutes
    ) {
        if (status != ParkingAvailabilityStatus.AVAILABLE) {
            return Optional.empty();
        }
        return operation.flatMap(currentOperation -> currentOperation.calculateFee(durationMinutes));
    }

    private Optional<Double> calculateScore(
            ParkingAvailabilityStatus status,
            int distanceMeters,
            Optional<Integer> estimatedFee,
            int durationMinutes
    ) {
        if (status != ParkingAvailabilityStatus.AVAILABLE) {
            return Optional.empty();
        }
        return estimatedFee.map(fee -> {
            double referenceFee = (double) durationMinutes * FEE_PER_10_MINUTES / REFERENCE_MINUTES;
            double distanceScore = normalize(distanceMeters, DISTANCE_REFERENCE_METERS);
            double feeScore = normalize(fee, referenceFee);
            return round((distanceScore + feeScore) / 2);
        });
    }

    private double normalize(int value, double reference) {
        return Math.min(Math.max(value / reference, 0d), 1d);
    }

    private double round(double value) {
        return Math.round(value * SCORE_ROUNDING_FACTOR) / SCORE_ROUNDING_FACTOR;
    }
}
