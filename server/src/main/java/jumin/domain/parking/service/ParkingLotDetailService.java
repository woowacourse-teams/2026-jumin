package jumin.domain.parking.service;

import java.time.Duration;
import java.util.List;
import jumin.domain.parking.dto.ParkingLotDetailResponse;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parking.entity.ParkingOperation;
import jumin.domain.parking.repository.ParkingLotRepository;
import jumin.domain.parking.repository.ParkingOperationRepository;
import jumin.domain.walking.service.WalkingDistanceResult;
import jumin.domain.walking.service.WalkingDistanceService;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ParkingLotDetailService {

    private final ParkingLotRepository parkingLotRepository;
    private final ParkingOperationRepository parkingOperationRepository;
    private final ParkingSearchQueryValidator queryValidator;
    private final ParkingOperationEvaluator operationEvaluator;
    private final WalkingDistanceService walkingDistanceService;

    public ParkingLotDetailResponse getDetail(Long parkingLotId, ParkingSearchRequest request) {
        queryValidator.validateForDetail(request);

        ParkingLot parkingLot = parkingLotRepository.findActiveWithLocationById(parkingLotId)
                .orElseThrow(() -> {
                    log.atWarn()
                            .setMessage("주차장 상세 정보를 찾을 수 없습니다.")
                            .addKeyValue("parkingLotId", parkingLotId)
                            .addKeyValue("status", ErrorCode.PARKING_LOT_NOT_FOUND.getHttpStatus().value())
                            .log();
                    return new BusinessException(ErrorCode.PARKING_LOT_NOT_FOUND);
                });
        ParkingOperation operation = parkingOperationRepository.findById(parkingLotId)
                .orElse(null);

        WalkingDistanceResult walkingDistances = walkingDistanceService.findDistances(
                request.destinationLatitude(),
                request.destinationLongitude(),
                List.of(parkingLot)
        );
        Integer walkingDistance = walkingDistances.distancesByParkingLotId().get(parkingLotId);
        if (walkingDistance == null) {
            log.atWarn()
                    .setMessage("주차장까지의 도보 경로를 찾을 수 없습니다.")
                    .addKeyValue("parkingLotId", parkingLotId)
                    .addKeyValue("status", ErrorCode.WALKING_ROUTE_NOT_FOUND.getHttpStatus().value())
                    .log();
            throw new BusinessException(ErrorCode.WALKING_ROUTE_NOT_FOUND);
        }
        int distanceMeters = walkingDistance;
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

        String availabilityStatusName = "UNKNOWN";
        if (availabilityStatus != null) {
            availabilityStatusName = availabilityStatus.name();
        }

        log.atInfo()
                .setMessage("주차장 상세 조회가 완료되었습니다.")
                .addKeyValue("parkingLotId", parkingLotId)
                .addKeyValue("distanceMeters", distanceMeters)
                .addKeyValue("availabilityStatus", availabilityStatusName)
                .addKeyValue("hasOperation", operation != null)
                .log();

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
