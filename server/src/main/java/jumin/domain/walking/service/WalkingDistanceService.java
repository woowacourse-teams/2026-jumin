package jumin.domain.walking.service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.walking.dto.WalkingDistanceQueryResult;
import jumin.domain.walking.repository.WalkingDistanceRepository;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class WalkingDistanceService {

    private static final int MAX_SNAP_DISTANCE_METERS = 100;

    private final WalkingDistanceRepository walkingDistanceRepository;

    public WalkingDistanceResult findDistances(
        double latitude,
        double longitude,
        List<ParkingLot> parkingLots
    ) {
        if (parkingLots.isEmpty()) {
            return new WalkingDistanceResult(Map.of());
        }

        if (!walkingDistanceRepository.hasUsableNetwork()) {
            throw new BusinessException(ErrorCode.WALKING_NETWORK_UNAVAILABLE);
        }

        List<Long> parkingLotIds = parkingLots.stream()
            .map(ParkingLot::getId)
            .toList();

        Map<Long, Integer> distancesByParkingLotId = walkingDistanceRepository.findDistances(
                latitude,
                longitude,
                parkingLotIds,
                MAX_SNAP_DISTANCE_METERS
            ).stream()
            .collect(Collectors.toMap(
                WalkingDistanceQueryResult::parkingLotId,
                WalkingDistanceQueryResult::distanceMeters,
                Math::min
            ));

        return new WalkingDistanceResult(distancesByParkingLotId);
    }
}
