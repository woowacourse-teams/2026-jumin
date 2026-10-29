package jumin.domain.parkingavailability.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import jumin.domain.parkingavailability.dto.AvailabilityObservation;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "parking_availability")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ParkingAvailability {

    @Id
    @Column(name = "parking_lot_id")
    private Long parkingLotId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AvailabilityProvider provider;

    @Column(name = "external_id", nullable = false, length = 100)
    private String externalId;

    @Column(nullable = false)
    private Integer capacity;

    @Column(nullable = false)
    private Integer occupied;

    @Column(nullable = false)
    private Integer available;

    @Column(name = "source_updated_at")
    private Instant sourceUpdatedAt;

    @Column(name = "fetched_at", nullable = false)
    private Instant fetchedAt;

    public ParkingAvailability(Long parkingLotId, AvailabilityObservation observation) {
        this.parkingLotId = parkingLotId;
        update(observation);
    }

    public void update(AvailabilityObservation observation) {
        if (isOlder(observation)) {
            return;
        }
        this.provider = observation.provider();
        this.externalId = observation.externalId();
        this.capacity = observation.capacity();
        this.occupied = observation.occupied();
        this.available = observation.available();
        this.sourceUpdatedAt = observation.sourceUpdatedAt();
        this.fetchedAt = observation.fetchedAt();
    }

    public boolean matches(AvailabilityObservation observation) {
        return provider == observation.provider() && Objects.equals(externalId, observation.externalId())
                && Objects.equals(capacity, observation.capacity())
                && Objects.equals(occupied, observation.occupied())
                && Objects.equals(available, observation.available())
                && Objects.equals(sourceUpdatedAt, observation.sourceUpdatedAt());
    }

    public boolean isCorrection(AvailabilityObservation observation) {
        return sourceUpdatedAt != null && sourceUpdatedAt.equals(observation.sourceUpdatedAt())
                && provider == observation.provider() && Objects.equals(externalId, observation.externalId())
                && !matches(observation) && !isOlder(observation);
    }

    private boolean isOlder(AvailabilityObservation observation) {
        if (fetchedAt != null && observation.fetchedAt().isBefore(fetchedAt)) {
            return true;
        }
        return sourceUpdatedAt != null && observation.sourceUpdatedAt() != null
                && observation.sourceUpdatedAt().isBefore(sourceUpdatedAt);
    }
}
