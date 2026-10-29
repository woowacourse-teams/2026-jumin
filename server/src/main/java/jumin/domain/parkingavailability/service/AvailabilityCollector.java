package jumin.domain.parkingavailability.service;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.List;
import jumin.domain.parkingavailability.client.AvailabilityClient;
import jumin.domain.parkingavailability.dto.AvailabilityObservation;
import jumin.domain.parkingavailability.entity.AvailabilityProvider;
import jumin.domain.parkingavailability.repository.AvailabilityRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "parking.availability.enabled", havingValue = "true")
public class AvailabilityCollector {

    private static final String COLLECTION_TIME_ZONE = "Asia/Seoul";
    private static final String COLLECTION_METRIC_NAME = "parking.availability.collection";
    private static final String SUCCESS_RESULT = "success";
    private static final String FAILURE_RESULT = "failure";

    private final List<AvailabilityClient> clients;
    private final AvailabilityRepository repository;
    private final MeterRegistry meterRegistry;

    @Scheduled(cron = "0 */5 * * * *", zone = COLLECTION_TIME_ZONE)
    public void collect() {
        for (AvailabilityClient client : clients) {
            collect(client);
        }
    }

    private void collect(AvailabilityClient client) {
        AvailabilityProvider provider = client.provider();
        try {
            List<AvailabilityObservation> observations = client.fetch();
            int saved = repository.saveAll(observations);
            recordCollection(provider, SUCCESS_RESULT);
            logCollectionCompleted(provider, observations.size(), saved);
        } catch (RuntimeException exception) {
            recordCollection(provider, FAILURE_RESULT);
            logCollectionFailed(provider, exception);
        }
    }

    private void recordCollection(AvailabilityProvider provider, String result) {
        meterRegistry.counter(COLLECTION_METRIC_NAME, "provider", provider.name(), "result", result)
                .increment();
    }

    private void logCollectionCompleted(AvailabilityProvider provider, int observationCount, int savedHistoryCount) {
        log.atInfo().setMessage("실시간 여석 API 수집을 완료했습니다.")
                .addKeyValue("provider", provider)
                .addKeyValue("observations", observationCount)
                .addKeyValue("savedHistory", savedHistoryCount).log();
    }

    private void logCollectionFailed(AvailabilityProvider provider, RuntimeException exception) {
        log.atWarn().setMessage("실시간 여석 API 수집에 실패했습니다.")
                .addKeyValue("provider", provider)
                .addKeyValue("failureType", exception.getClass().getSimpleName()).log();
    }
}
