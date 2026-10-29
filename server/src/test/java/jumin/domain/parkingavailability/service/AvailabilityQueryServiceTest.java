package jumin.domain.parkingavailability.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.stream.Stream;
import jumin.domain.parkingavailability.dto.AvailabilityObservation;
import jumin.domain.parkingavailability.entity.AvailabilityProvider;
import jumin.domain.parkingavailability.entity.ParkingAvailability;
import jumin.domain.parkingavailability.repository.AvailabilityQueryRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

class AvailabilityQueryServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-29T03:00:00Z");
    private static final Instant CUTOFF = NOW.minusSeconds(15 * 60);

    private final AvailabilityQueryRepository repository = mock(AvailabilityQueryRepository.class);
    private final AvailabilityQueryService service = new AvailabilityQueryService(
            repository, Clock.fixed(NOW, ZoneOffset.UTC)
    );

    @ParameterizedTest
    @ValueSource(ints = {0, 8, 60})
    @DisplayName("최신 잔여석을 만차인 0을 포함해 원래 수치로 반환한다")
    void returns_fresh_available_spaces_including_zero(int available) {
        // given
        when(repository.findCurrentByParkingLotId(1L))
                .thenReturn(Optional.of(current(NOW.minusSeconds(300), NOW.minusSeconds(300), available)));

        // when
        Integer result = service.findAvailableSpaces(1L);

        // then
        assertThat(result).isEqualTo(available);
    }

    @Test
    @DisplayName("유효한 매핑의 현재값이 없으면 잔여석을 제공하지 않는다")
    void returns_null_when_current_availability_is_missing() {
        // given
        when(repository.findCurrentByParkingLotId(1L)).thenReturn(Optional.empty());

        // when
        Integer result = service.findAvailableSpaces(1L);

        // then
        assertThat(result).isNull();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("freshnessCases")
    @DisplayName("수집 시각과 알려진 원천 갱신 시각의 15분 경계를 적용한다")
    void applies_fifteen_minute_freshness_to_fetch_and_known_source_times(
            String description, Instant fetchedAt, Instant sourceUpdatedAt, Integer expected
    ) {
        // given
        when(repository.findCurrentByParkingLotId(1L))
                .thenReturn(Optional.of(current(fetchedAt, sourceUpdatedAt, 8)));

        // when
        Integer result = service.findAvailableSpaces(1L);

        // then
        assertThat(result).isEqualTo(expected);
    }

    private static Stream<Arguments> freshnessCases() {
        return Stream.of(
                Arguments.of("두 시각이 정확히 15분 전이면 제공", CUTOFF, CUTOFF, 8),
                Arguments.of("수집 시각이 15분을 1ns 초과하면 미제공", CUTOFF.minusNanos(1), NOW, null),
                Arguments.of("최근 수집한 원천 시각이 15분을 1ns 초과하면 미제공", NOW, CUTOFF.minusNanos(1), null),
                Arguments.of("원천 시각이 없어도 최근 수집값은 제공", NOW.minusSeconds(300), null, 8),
                Arguments.of("원천 시각 없이 수집 시각이 정확히 15분 전이면 제공", CUTOFF, null, 8),
                Arguments.of("원천 시각 없이 수집 시각이 15분을 1ns 초과하면 미제공", CUTOFF.minusNanos(1), null, null),
                Arguments.of("수집 정책이 허용한 120초 미래 원천 시각은 제공", NOW, NOW.plusSeconds(120), 8)
        );
    }

    private ParkingAvailability current(Instant fetchedAt, Instant sourceUpdatedAt, int available) {
        AvailabilityObservation observation = new AvailabilityObservation(
                AvailabilityProvider.SEOUL, "S01", null, null,
                100, 100 - available, available, sourceUpdatedAt, fetchedAt
        );
        return new ParkingAvailability(1L, observation);
    }
}
