package jumin.domain.parkingavailability.client;

import java.util.List;
import jumin.domain.parkingavailability.dto.AvailabilityObservation;

record AvailabilityPage(Integer total, List<AvailabilityObservation> observations) {
}
