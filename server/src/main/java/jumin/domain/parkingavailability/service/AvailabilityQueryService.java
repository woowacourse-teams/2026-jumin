package jumin.domain.parkingavailability.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import jumin.domain.parkingavailability.entity.ParkingAvailability;
import jumin.domain.parkingavailability.repository.AvailabilityQueryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AvailabilityQueryService {

    private static final Duration MAX_AGE = Duration.ofMinutes(15);

    private final AvailabilityQueryRepository availabilityQueryRepository;
    private final Clock clock;

    public Integer findAvailableSpaces(Long parkingLotId) {
        ParkingAvailability availability = availabilityQueryRepository.findCurrentByParkingLotId(parkingLotId)
                .orElse(null);
        if (availability == null) {
            return null;
        }

        Instant oldestAllowed = clock.instant().minus(MAX_AGE);
        if (availability.getFetchedAt().isBefore(oldestAllowed)) {
            return null;
        }
        Instant sourceUpdatedAt = availability.getSourceUpdatedAt();
        if (sourceUpdatedAt != null && sourceUpdatedAt.isBefore(oldestAllowed)) {
            return null;
        }
        return availability.getAvailable();
    }
}
