package jumin.domain.parking.service;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import jumin.domain.parking.dto.ParkingLotResponse;
import jumin.domain.parking.dto.ParkingLotViewportDetailResponse;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.domain.parking.dto.ParkingSearchResponse;
import jumin.domain.parking.dto.ParkingLotViewportResponse;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
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
public class ParkingSearchService {

    private static final int SEARCH_RADIUS_METERS = 600;

    private final ParkingLotRepository parkingLotRepository;
    private final ParkingOperationRepository parkingOperationRepository;
    private final ParkingSearchQueryValidator queryValidator;
    private final ParkingOperationEvaluator operationEvaluator;
    private final ParkingBalancedScoreCalculator balancedScoreCalculator;
    private final WalkingDistanceService walkingDistanceService;

    public ParkingSearchResponse search(ParkingSearchRequest request) {
        queryValidator.validate(request);

        Coordinate destination = new Coordinate(request.destinationLatitude(), request.destinationLongitude());

        List<ParkingLot> candidates = findCandidates(destination);
        if (candidates.isEmpty()) {
            log.atInfo()
                    .setMessage("주차장 검색이 완료되었습니다.")
                    .addKeyValue("candidateCount", 0)
                    .addKeyValue("resultCount", 0)
                    .addKeyValue("radiusMeters", SEARCH_RADIUS_METERS)
                    .log();
            return ParkingSearchResponse.from(SEARCH_RADIUS_METERS, List.of());
        }

        Map<Long, ParkingOperation> operationsByParkingLotId = findOperationsByParkingLotId(candidates);
        WalkingDistanceResult walkingDistances = walkingDistanceService.findDistances(
                destination.latitude(),
                destination.longitude(),
                candidates
        );

        int durationMinutes = durationMinutesOf(request);

        List<ParkingLotResponse> parkingLots = calculateParkingLots(
                candidates,
                operationsByParkingLotId,
                request,
                durationMinutes,
                walkingDistances
        );

        log.atInfo()
                .setMessage("주차장 검색이 완료되었습니다.")
                .addKeyValue("candidateCount", candidates.size())
                .addKeyValue("resultCount", parkingLots.size())
                .addKeyValue("radiusMeters", SEARCH_RADIUS_METERS)
                .log();

        return ParkingSearchResponse.from(SEARCH_RADIUS_METERS, parkingLots);
    }

    public ParkingLotViewportResponses searchViewport(ParkingLotViewportRequest request) {
        validateCoordinateOrder(request);

        List<ParkingLotViewportResponse> parkingLots = parkingLotRepository.findActiveWithinViewport(
                        request.westLongitude(),
                        request.southLatitude(),
                        request.eastLongitude(),
                        request.northLatitude()
                ).stream()
                .map(ParkingLotViewportResponse::from)
                .toList();

        log.atInfo()
                .setMessage("지도 viewport 주차장 조회가 완료되었습니다.")
                .addKeyValue("resultCount", parkingLots.size())
                .log();

        return ParkingLotViewportResponses.from(parkingLots);
    }

    public ParkingLotViewportDetailResponse getParkingLotDetail(Long parkingLotId) {
        ParkingLot parkingLot = parkingLotRepository.findActiveById(parkingLotId)
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

        return ParkingLotViewportDetailResponse.from(parkingLot, operation);
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
            ParkingSearchRequest request,
            int durationMinutes,
            WalkingDistanceResult walkingDistances
    ) {
        return candidates.stream()
                .map(candidate -> calculateParkingLotResponse(
                        candidate,
                        operationsByParkingLotId.get(candidate.getId()),
                        request,
                        durationMinutes,
                        walkingDistances
                ))
                .filter(java.util.Objects::nonNull)
                .filter(result -> result.distanceMeters() <= SEARCH_RADIUS_METERS)
                .toList();
    }

    private void validateCoordinateOrder(ParkingLotViewportRequest request) {
        if (request.northLatitude() <= request.southLatitude()
                || request.westLongitude() >= request.eastLongitude()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT);
        }
    }

    private ParkingLotResponse calculateParkingLotResponse(
            ParkingLot parkingLot,
            ParkingOperation operation,
            ParkingSearchRequest request,
            int durationMinutes,
            WalkingDistanceResult walkingDistances
    ) {
        ParkingAvailabilityStatus availabilityStatus = operationEvaluator.evaluate(
                operation,
                request.entryAt(),
                request.exitAt()
        );

        Integer distanceMeters = walkingDistances.distancesByParkingLotId().get(parkingLot.getId());
        if (distanceMeters == null) {
            return null;
        }

        Integer estimatedFee = null;
        if (operation != null) {
            estimatedFee = operation.calculateFee(
                    durationMinutes,
                    request.entryAt().getDayOfWeek()
            );
        }

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
