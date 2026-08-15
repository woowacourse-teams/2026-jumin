package jumin.domain.parking.service;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import jumin.domain.parking.dto.ParkingLotResponse;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.domain.parking.dto.ParkingSearchResponse;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parking.entity.ParkingOperation;
import jumin.domain.parking.repository.ParkingLotRepository;
import jumin.domain.parking.repository.ParkingOperationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ParkingSearchService {

    private static final int SEARCH_RADIUS_METERS = 600;

    private final ParkingLotRepository parkingLotRepository;
    private final ParkingOperationRepository parkingOperationRepository;
    private final ParkingSearchQueryValidator queryValidator;
    private final ParkingOperationEvaluator operationEvaluator;
    private final GeoDistanceCalculator geoDistanceCalculator;
    private final ParkingBalancedScoreCalculator balancedScoreCalculator;

    public ParkingSearchResponse search(ParkingSearchRequest request) {
        queryValidator.validate(request);

        Coordinate destination = new Coordinate(request.destinationLatitude(), request.destinationLongitude());

        List<ParkingLot> candidates = findCandidates(destination);
        if (candidates.isEmpty()) {
            return ParkingSearchResponse.from(SEARCH_RADIUS_METERS, List.of());
        }

        Map<Long, ParkingOperation> operationsByParkingLotId = findOperationsByParkingLotId(candidates);

        int durationMinutes = durationMinutesOf(request);

        List<ParkingLotResponse> parkingLots = calculateParkingLots(
                candidates,
                operationsByParkingLotId,
                destination,
                request,
                durationMinutes
        );

        return ParkingSearchResponse.from(SEARCH_RADIUS_METERS, parkingLots);
    }

    private List<ParkingLot> findCandidates(Coordinate destination) {
        return parkingLotRepository.findActiveWithinRadius(
                destination.latitude(),
                destination.longitude(),
                SEARCH_RADIUS_METERS
        );
    }

    private int durationMinutesOf(ParkingSearchRequest request) {
        return Math.toIntExact(Duration.between(request.entryAt(), request.exitAt()).toMinutes());
    }

    private Map<Long, ParkingOperation> findOperationsByParkingLotId(List<ParkingLot> candidates) {
        return parkingOperationRepository
                .findAllByParkingLotIdIn(candidates.stream()
                        .map(ParkingLot::getId)
                        .toList())
                .stream()
                .collect(Collectors.toMap(ParkingOperation::getParkingLotId, Function.identity()));
    }

    private List<ParkingLotResponse> calculateParkingLots(
            List<ParkingLot> candidates,
            Map<Long, ParkingOperation> operationsByParkingLotId,
            Coordinate destination,
            ParkingSearchRequest request,
            int durationMinutes
    ) {
        return candidates.stream()
                .map(candidate -> calculateParkingLotResponse(
                        candidate,
                        operationsByParkingLotId.get(candidate.getId()),
                        destination,
                        request,
                        durationMinutes
                ))
                .filter(result -> result.distanceMeters() <= SEARCH_RADIUS_METERS)
                .toList();
    }

    private ParkingLotResponse calculateParkingLotResponse(
            ParkingLot parkingLot,
            ParkingOperation operation,
            Coordinate destination,
            ParkingSearchRequest request,
            int durationMinutes
    ) {
        ParkingAvailabilityStatus availabilityStatus = operationEvaluator.evaluate(
                operation,
                request.entryAt(),
                request.exitAt()
        );

        Coordinate parkingLocation = new Coordinate(parkingLot.getLatitude(), parkingLot.getLongitude());
        int distanceMeters = geoDistanceCalculator.distanceMeters(destination, parkingLocation);

        Integer estimatedFee = operation == null ? null : operation.calculateFee(durationMinutes);

        Double balancedScore = balancedScoreCalculator.calculate(
                availabilityStatus,
                distanceMeters,
                estimatedFee,
                durationMinutes
        );

        return ParkingLotResponse.from(
                parkingLot.getId(),
                parkingLot.getName(),
                parkingLot.getAddress(),
                parkingLot.getLatitude(),
                parkingLot.getLongitude(),
                distanceMeters,
                estimatedFee,
                balancedScore,
                availabilityStatus.name()
        );
    }
}
