package jumin.domain.parkingavailability.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parkingavailability.dto.AvailabilityObservation;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "parking_availability_history",
        uniqueConstraints = @UniqueConstraint(
                columnNames = {"parking_lot_id", "provider", "external_id", "observation_key"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ParkingAvailabilityHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "parking_lot_id", nullable = false)
    private ParkingLot parkingLot;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AvailabilityProvider provider;

    @Column(name = "external_id", nullable = false, length = 100)
    private String externalId;

    @Column(name = "observation_key", nullable = false, columnDefinition = "text")
    private String observationKey;

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

    public ParkingAvailabilityHistory(
            ParkingLot parkingLot,
            AvailabilityObservation observation,
            String observationKey
    ) {
        this.parkingLot = parkingLot;
        this.provider = observation.provider();
        this.externalId = observation.externalId();
        this.observationKey = observationKey;
        this.capacity = observation.capacity();
        this.occupied = observation.occupied();
        this.available = observation.available();
        this.sourceUpdatedAt = observation.sourceUpdatedAt();
        this.fetchedAt = observation.fetchedAt();
    }
}
