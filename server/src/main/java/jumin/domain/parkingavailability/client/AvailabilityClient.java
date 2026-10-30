package jumin.domain.parkingavailability.client;

import java.util.List;
import jumin.domain.parkingavailability.dto.AvailabilityObservation;
import jumin.domain.parkingavailability.entity.AvailabilityProvider;

public interface AvailabilityClient {

    AvailabilityProvider provider();

    List<AvailabilityObservation> fetch();
}
