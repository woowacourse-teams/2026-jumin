package jumin.domain.parkingavailability.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Instant;
import java.util.List;
import jumin.domain.parkingavailability.client.AvailabilityClient;
import jumin.domain.parkingavailability.dto.AvailabilityObservation;
import jumin.domain.parkingavailability.entity.AvailabilityProvider;
import jumin.domain.parkingavailability.repository.AvailabilityRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class AvailabilityCollectorTest {

    private final AvailabilityClient seoul = mock(AvailabilityClient.class);
    private final AvailabilityClient busan = mock(AvailabilityClient.class);
    private final AvailabilityRepository repository = mock(AvailabilityRepository.class);
    private final SimpleMeterRegistry metrics = new SimpleMeterRegistry();
    private final Instant now = Instant.parse("2026-10-23T06:00:00Z");

    @Test
    @DisplayName("한 제공기관이 실패해도 다른 제공기관을 호출하고 각각 성공·실패를 기록한다")
    void one_provider_failure_does_not_stop_other_provider() {
        // given
        when(seoul.provider()).thenReturn(AvailabilityProvider.SEOUL);
        when(busan.provider()).thenReturn(AvailabilityProvider.BUSAN);
        when(seoul.fetch()).thenThrow(new IllegalStateException("upstream error"));
        when(busan.fetch()).thenReturn(List.of(observation(AvailabilityProvider.BUSAN)));

        // when
        collector().collect();

        // then
        verify(seoul).fetch();
        verify(busan).fetch();
        verify(repository).saveAll(List.of(observation(AvailabilityProvider.BUSAN)));
        assertThat(collectionCount(AvailabilityProvider.SEOUL, "failure")).isEqualTo(1);
        assertThat(collectionCount(AvailabilityProvider.BUSAN, "success")).isEqualTo(1);
    }

    @Test
    @DisplayName("한 제공기관의 수집 결과가 비어 있어도 다른 제공기관의 수집·저장을 계속한다")
    void empty_source_does_not_stop_other_provider() {
        // given
        when(seoul.provider()).thenReturn(AvailabilityProvider.SEOUL);
        when(busan.provider()).thenReturn(AvailabilityProvider.BUSAN);
        when(seoul.fetch()).thenReturn(List.of());
        List<AvailabilityObservation> busanRows = List.of(observation(AvailabilityProvider.BUSAN));
        when(busan.fetch()).thenReturn(busanRows);

        // when
        collector().collect();

        // then
        verify(repository).saveAll(List.of());
        verify(repository).saveAll(busanRows);
        assertThat(collectionCount(AvailabilityProvider.SEOUL, "success")).isEqualTo(1);
        assertThat(collectionCount(AvailabilityProvider.BUSAN, "success")).isEqualTo(1);
    }

    @Test
    @DisplayName("한 제공기관의 저장이 실패해도 다른 제공기관의 수집·저장은 계속한다")
    void one_provider_storage_failure_does_not_stop_other_provider() {
        // given
        when(seoul.provider()).thenReturn(AvailabilityProvider.SEOUL);
        when(busan.provider()).thenReturn(AvailabilityProvider.BUSAN);
        List<AvailabilityObservation> seoulRows = List.of(observation(AvailabilityProvider.SEOUL));
        List<AvailabilityObservation> busanRows = List.of(observation(AvailabilityProvider.BUSAN));
        when(seoul.fetch()).thenReturn(seoulRows);
        when(busan.fetch()).thenReturn(busanRows);
        doThrow(new IllegalStateException("storage error")).when(repository).saveAll(seoulRows);

        // when
        collector().collect();

        // then
        verify(repository).saveAll(busanRows);
        assertThat(collectionCount(AvailabilityProvider.SEOUL, "failure")).isEqualTo(1);
        assertThat(collectionCount(AvailabilityProvider.BUSAN, "success")).isEqualTo(1);
    }

    private double collectionCount(AvailabilityProvider provider, String result) {
        return metrics.get("parking.availability.collection").tag("provider", provider.name())
                .tag("result", result).counter().count();
    }

    private AvailabilityObservation observation(AvailabilityProvider provider) {
        return new AvailabilityObservation(provider, "test", "name", null, 100, 80, 20, now, now);
    }

    private AvailabilityCollector collector() {
        return new AvailabilityCollector(List.of(seoul, busan), repository, metrics);
    }
}
