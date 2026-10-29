package jumin.domain.parkingavailability.repository;

import jakarta.persistence.EntityManager;
import java.util.Optional;
import jumin.domain.parkingavailability.entity.ParkingAvailability;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class AvailabilityQueryRepository {

    private final EntityManager entityManager;

    public Optional<ParkingAvailability> findCurrentByParkingLotId(Long parkingLotId) {
        return entityManager.createQuery("""
                        select availability from ParkingAvailability availability
                        where availability.parkingLotId = :parkingLotId
                          and exists (
                              select mapping.id from ParkingAvailabilityMapping mapping
                              join mapping.parkingLot parkingLot
                              where parkingLot.id = availability.parkingLotId
                                and mapping.provider = availability.provider
                                and mapping.externalId = availability.externalId
                                and parkingLot.isActive = true
                                and mapping.expectedName = trim(parkingLot.name)
                                and mapping.expectedAddress = trim(parkingLot.address)
                          )
                        """, ParkingAvailability.class)
                .setParameter("parkingLotId", parkingLotId)
                .getResultList()
                .stream()
                .findFirst();
    }
}
