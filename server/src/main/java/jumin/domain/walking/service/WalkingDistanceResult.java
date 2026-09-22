package jumin.domain.walking.service;

import java.util.Map;

public record WalkingDistanceResult(
    Map<Long, Integer> distancesByParkingLotId
) {

    public WalkingDistanceResult {
        distancesByParkingLotId = Map.copyOf(distancesByParkingLotId);
    }
}
