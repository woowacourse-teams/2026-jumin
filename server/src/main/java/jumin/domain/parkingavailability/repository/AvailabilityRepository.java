package jumin.domain.parkingavailability.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parkingavailability.dto.AvailabilityObservation;
import jumin.domain.parkingavailability.entity.AvailabilityProvider;
import jumin.domain.parkingavailability.entity.ParkingAvailability;
import jumin.domain.parkingavailability.entity.ParkingAvailabilityHistory;
import jumin.domain.parkingavailability.entity.ParkingAvailabilityMapping;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
@RequiredArgsConstructor
public class AvailabilityRepository {

    private static final int MAX_FUTURE_SOURCE_SECONDS = 120;

    private final EntityManager entityManager;

    @Transactional
    public int saveAll(List<AvailabilityObservation> observations) {
        Map<String, AvailabilityObservation> observationsBySource = indexUsableObservations(observations);
        if (observationsBySource.isEmpty()) {
            return 0;
        }
        int saved = 0;
        for (ParkingAvailabilityMapping mapping : findActiveMappings()) {
            String sourceKey = sourceKey(mapping.getProvider(), mapping.getExternalId());
            AvailabilityObservation observation = observationsBySource.get(sourceKey);
            if (observation != null) {
                saved += save(mapping, observation);
            }
        }
        entityManager.flush();
        return saved;
    }

    private Map<String, AvailabilityObservation> indexUsableObservations(List<AvailabilityObservation> observations) {
        return observations.stream()
                .filter(this::isUsable)
                .collect(Collectors.toMap(row -> sourceKey(row.provider(), row.externalId()), row -> row));
    }

    private List<ParkingAvailabilityMapping> findActiveMappings() {
        return entityManager.createQuery("""
                select mapping from ParkingAvailabilityMapping mapping
                join fetch mapping.parkingLot parkingLot
                where parkingLot.isActive = true
                order by parkingLot.id, mapping.id
                """, ParkingAvailabilityMapping.class).getResultList();
    }

    private int save(ParkingAvailabilityMapping mapping, AvailabilityObservation observation) {
        ParkingLot parkingLot = mapping.getParkingLot();
        entityManager.refresh(parkingLot, LockModeType.PESSIMISTIC_WRITE);
        if (!mapping.matchesParkingLot()) {
            return 0;
        }
        ParkingAvailability current = entityManager.find(ParkingAvailability.class, parkingLot.getId());
        int saved = saveHistory(parkingLot, current, observation);
        updateCurrent(parkingLot.getId(), current, observation);
        return saved;
    }

    private int saveHistory(ParkingLot parkingLot, ParkingAvailability current,
                            AvailabilityObservation observation) {
        if (isRepeatedUndatedObservation(current, observation)) {
            return 0;
        }
        String observationKey = observationKey(observation);
        boolean duplicate = historyExists(parkingLot.getId(), observation, observationKey);
        if (duplicate && current != null && current.isCorrection(observation)) {
            observationKey += "|fetched:" + observation.fetchedAt();
            duplicate = historyExists(parkingLot.getId(), observation, observationKey);
        }
        if (duplicate) {
            return 0;
        }
        entityManager.persist(new ParkingAvailabilityHistory(parkingLot, observation, observationKey));
        return 1;
    }

    private void updateCurrent(Long parkingLotId, ParkingAvailability current,
                               AvailabilityObservation observation) {
        if ((current == null || current.getSourceUpdatedAt() == null)
                && hasNewerSourceInHistory(parkingLotId, observation)) {
            return;
        }
        if (current == null) {
            entityManager.persist(new ParkingAvailability(parkingLotId, observation));
            return;
        }
        current.update(observation);
    }

    private boolean hasNewerSourceInHistory(Long parkingLotId, AvailabilityObservation observation) {
        if (observation.sourceUpdatedAt() == null) {
            return false;
        }
        return entityManager.createQuery("""
                        select count(history) from ParkingAvailabilityHistory history
                        where history.parkingLot.id = :parkingLotId and history.sourceUpdatedAt > :sourceUpdatedAt
                        """, Long.class)
                .setParameter("parkingLotId", parkingLotId)
                .setParameter("sourceUpdatedAt", observation.sourceUpdatedAt())
                .getSingleResult() > 0;
    }

    private boolean historyExists(Long parkingLotId, AvailabilityObservation observation, String observationKey) {
        return entityManager.createQuery("""
                        select count(history) from ParkingAvailabilityHistory history
                        where history.parkingLot.id = :parkingLotId and history.provider = :provider
                          and history.externalId = :externalId and history.observationKey = :observationKey
                        """, Long.class)
                .setParameter("parkingLotId", parkingLotId)
                .setParameter("provider", observation.provider())
                .setParameter("externalId", observation.externalId())
                .setParameter("observationKey", observationKey)
                .getSingleResult() > 0;
    }

    private boolean isRepeatedUndatedObservation(ParkingAvailability current, AvailabilityObservation observation) {
        return observation.sourceUpdatedAt() == null && current != null && current.matches(observation);
    }

    private String observationKey(AvailabilityObservation observation) {
        String sourceTime = observation.sourceUpdatedAt() == null
                ? "missing:" + observation.fetchedAt() : observation.sourceUpdatedAt().toString();
        return sourceTime + "|" + observation.capacity() + "|" + observation.occupied() + "|" + observation.available();
    }

    private String sourceKey(AvailabilityProvider provider, String externalId) {
        return provider.name() + ":" + externalId;
    }

    private boolean isUsable(AvailabilityObservation observation) {
        return hasRequiredFields(observation) && hasValidCounts(observation) && hasValidSourceTime(observation);
    }

    private boolean hasRequiredFields(AvailabilityObservation observation) {
        return observation.provider() != null
                && observation.externalId() != null && !observation.externalId().isBlank()
                && observation.fetchedAt() != null && observation.capacity() != null
                && observation.occupied() != null && observation.available() != null;
    }

    private boolean hasValidCounts(AvailabilityObservation observation) {
        return observation.capacity() > 0
                && observation.occupied() >= 0 && observation.occupied() <= observation.capacity()
                && observation.available() >= 0 && observation.available() <= observation.capacity()
                && (long) observation.occupied() + observation.available() == observation.capacity();
    }

    private boolean hasValidSourceTime(AvailabilityObservation observation) {
        return observation.sourceUpdatedAt() == null
                || !observation.sourceUpdatedAt().isAfter(observation.fetchedAt().plusSeconds(MAX_FUTURE_SOURCE_SECONDS));
    }
}
