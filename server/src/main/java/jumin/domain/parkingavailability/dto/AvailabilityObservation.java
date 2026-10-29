package jumin.domain.parkingavailability.dto;

import java.time.Instant;
import jumin.domain.parkingavailability.entity.AvailabilityProvider;

public record AvailabilityObservation(
        AvailabilityProvider provider,
        String externalId,
        String name,
        String address,
        Integer capacity,
        Integer occupied,
        Integer available,
        Instant sourceUpdatedAt,
        Instant fetchedAt
) {
}
