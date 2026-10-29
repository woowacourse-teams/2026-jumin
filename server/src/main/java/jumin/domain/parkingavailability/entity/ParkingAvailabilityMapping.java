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
import jumin.domain.parking.entity.ParkingLot;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "parking_availability_mappings", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"provider", "external_id"}),
        @UniqueConstraint(columnNames = {"parking_lot_id", "provider"})
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ParkingAvailabilityMapping {

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

    @Column(name = "expected_name", nullable = false, columnDefinition = "text")
    private String expectedName;

    @Column(name = "expected_address", nullable = false, columnDefinition = "text")
    private String expectedAddress;

    public ParkingAvailabilityMapping(ParkingLot parkingLot, AvailabilityProvider provider, String externalId) {
        this.parkingLot = parkingLot;
        this.provider = provider;
        this.externalId = externalId;
        this.expectedName = parkingLot.getName().trim();
        this.expectedAddress = parkingLot.getAddress().trim();
    }

    public boolean matchesParkingLot() {
        return parkingLot.isActive()
                && expectedName.equals(parkingLot.getName().trim())
                && parkingLot.getAddress() != null
                && expectedAddress.equals(parkingLot.getAddress().trim());
    }
}
