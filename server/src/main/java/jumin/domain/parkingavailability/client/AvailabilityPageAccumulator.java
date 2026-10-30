package jumin.domain.parkingavailability.client;

import static jumin.domain.parkingavailability.client.AvailabilityPayloadSupport.MAX_PAGES;
import static jumin.domain.parkingavailability.client.AvailabilityPayloadSupport.PAGE_SIZE;
import static jumin.domain.parkingavailability.client.AvailabilityPayloadSupport.failure;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import jumin.domain.parkingavailability.dto.AvailabilityObservation;
import jumin.domain.parkingavailability.entity.AvailabilityProvider;

public final class AvailabilityPageAccumulator {

    private final AvailabilityProvider provider;
    private final List<AvailabilityObservation> observations = new ArrayList<>();
    private final Set<String> ids = new HashSet<>();
    private Integer expectedTotal;

    public AvailabilityPageAccumulator(AvailabilityProvider provider) {
        this.provider = provider;
    }

    public boolean add(Integer total, List<AvailabilityObservation> batch) {
        validatePage(total, batch.size());
        expectedTotal = total;
        for (AvailabilityObservation observation : batch) {
            validateExternalId(observation.externalId());
        }
        observations.addAll(batch);
        if (hasTooManyRows() || hasMissingRows(batch)) {
            throw failure(provider, "전체 주차장 데이터를 빠짐없이 수집하지 못했습니다.");
        }
        return observations.size() == expectedTotal;
    }

    public List<AvailabilityObservation> observations() {
        return List.copyOf(observations);
    }

    private void validatePage(Integer total, int pageSize) {
        if (hasInvalidTotal(total) || pageSize > PAGE_SIZE || hasChangedTotal(total)) {
            throw failure(provider, "전체 건수나 페이지 크기가 올바르지 않거나 수집 중 전체 건수가 변경되었습니다.");
        }
    }

    private boolean hasInvalidTotal(Integer total) {
        return total == null || total < 0 || total > PAGE_SIZE * MAX_PAGES;
    }

    private boolean hasChangedTotal(Integer total) {
        return expectedTotal != null && !expectedTotal.equals(total);
    }

    private boolean hasTooManyRows() {
        return observations.size() > expectedTotal;
    }

    private boolean hasMissingRows(List<AvailabilityObservation> batch) {
        return batch.isEmpty() && observations.size() < expectedTotal;
    }

    private void validateExternalId(String externalId) {
        if (externalId.isBlank() || !ids.add(externalId)) {
            throw failure(provider, "외부 주차장 코드가 없거나 중복되었습니다.");
        }
    }
}
