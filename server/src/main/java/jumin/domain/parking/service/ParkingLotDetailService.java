package jumin.domain.parking.service;

import java.time.Duration;
import jumin.domain.parking.dto.ParkingLotDetailResponse;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parking.entity.ParkingOperation;
import jumin.domain.parking.repository.ParkingLotRepository;
import jumin.domain.parking.repository.ParkingOperationRepository;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ParkingLotDetailService {

    private final ParkingLotRepository parkingLotRepository;
    private final ParkingOperationRepository parkingOperationRepository;
    private final ParkingSearchQueryValidator queryValidator;
    private final ParkingOperationEvaluator operationEvaluator;
    private final GeoDistanceCalculator geoDistanceCalculator;

    public ParkingLotDetailResponse getDetail(Long parkingLotId, ParkingSearchRequest request) {
        queryValidator.validateForDetail(request);

        ParkingLot parkingLot = parkingLotRepository.findActiveWithLocationById(parkingLotId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PARKING_LOT_NOT_FOUND));
        ParkingOperation operation = parkingOperationRepository.findById(parkingLotId)
                .orElse(null);

        Coordinate destination = new Coordinate(
                request.destinationLatitude(),
                request.destinationLongitude()
        );
        Coordinate parkingLocation = new Coordinate(
                parkingLot.getLatitude(),
                parkingLot.getLongitude()
        );
        int distanceMeters = geoDistanceCalculator.distanceMeters(destination, parkingLocation);
        int durationMinutes = Math.toIntExact(Duration.between(request.entryAt(), request.exitAt()).toMinutes());

        ParkingAvailabilityStatus availabilityStatus = operationEvaluator.evaluate(
                operation,
                request.entryAt(),
                request.exitAt()
        );

        Integer estimatedFee = null;
        if (operation != null) {
            estimatedFee = operation.calculateFee(durationMinutes, request.entryAt().getDayOfWeek());
        }

        return ParkingLotDetailResponse.from(
                parkingLot.getId(),
                parkingLot.getName(),
                parkingLot.getAddress(),
                parkingLot.getLatitude(),
                parkingLot.getLongitude(),
                parkingLot.getCapacity(),
                distanceMeters,
                estimatedFee,
                operation,
                availabilityStatus
        );
    }
}
