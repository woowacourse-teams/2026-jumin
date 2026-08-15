package jumin.domain.parking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import jumin.domain.parking.dto.ParkingLotResponse;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.domain.parking.dto.ParkingSearchResponse;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parking.entity.ParkingOperation;
import jumin.domain.parking.entity.ParkingOperationStatus;
import jumin.domain.parking.repository.ParkingLotRepository;
import jumin.domain.parking.repository.ParkingOperationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.springframework.test.util.ReflectionTestUtils;

class ParkingSearchServiceTest {

    private final ParkingLotRepository parkingLotRepository = mock(ParkingLotRepository.class);
    private final ParkingOperationRepository parkingOperationRepository = mock(ParkingOperationRepository.class);
    private ParkingSearchService service;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(Instant.parse("2026-08-13T00:00:00Z"), ZoneOffset.UTC);
        GeoDistanceCalculator geoDistanceCalculator = new GeoDistanceCalculator();
        service = new ParkingSearchService(
                parkingLotRepository,
                new ParkingSearchQueryValidator(clock),
                new ParkingSearchResultCalculator(
                        parkingOperationRepository,
                        new ParkingOperationEvaluator(),
                        geoDistanceCalculator
                )
        );
    }

    @Test
    @DisplayName("검색 요청을 반경 조회 저장소에 위임한다")
    void delegates_to_radius_query_repository() {
        // given
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenReturn(List.of());

        // when
        service.search(validQuery());

        // then
        verify(parkingLotRepository).findActiveWithinRadius(anyDouble(), anyDouble(), anyInt());
    }

    @Test
    @DisplayName("직선거리와 요금, 운영 상태, 균형점수를 응답에 매핑한다")
    void maps_straight_distance_fee_availability_and_balanced_score() {
        // given
        ParkingLot first = parkingLot(1L, 37.4982, 127.0280);
        ParkingLot second = parkingLot(2L, 37.4983, 127.0281);
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenReturn(List.of(first, second));
        when(parkingOperationRepository.findById(1L)).thenReturn(Optional.of(availableOperation(1L)));
        when(parkingOperationRepository.findById(2L)).thenReturn(Optional.of(availableOperation(2L)));

        // when
        ParkingSearchResponse result = service.search(validQuery());

        // then
        assertThat(result.totalCount()).isEqualTo(2);
        assertThat(result.parkingLots()).extracting(ParkingLotResponse::distanceMeters).containsExactly(14, 28);
        assertThat(result.parkingLots()).extracting(ParkingLotResponse::estimatedFee).containsOnly(2_500);
        assertThat(result.parkingLots()).extracting(ParkingLotResponse::availabilityStatus).containsOnly("AVAILABLE");
        assertThat(result.parkingLots()).extracting(ParkingLotResponse::balancedScore)
                .containsExactly(0.1506, 0.1622);
    }

    @Test
    @DisplayName("활성 후보가 없으면 빈 결과를 성공으로 반환한다")
    void returns_empty_success_when_no_active_candidates_exist() {
        // given
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenReturn(List.of());

        // when
        ParkingSearchResponse result = service.search(validQuery());

        // then
        assertThat(result.searchRadiusMeters()).isEqualTo(600);
        assertThat(result.totalCount()).isZero();
        assertThat(result.parkingLots()).isEmpty();
    }

    @Test
    @DisplayName("주차장 조회 중 저장소 예외를 그대로 전달한다")
    void propagates_repository_failure() {
        // given
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenThrow(new IllegalStateException("database detail"));

        // when & then
        assertThatThrownBy(() -> service.search(validQuery()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("database detail");
    }

    private ParkingSearchRequest validQuery() {
        return new ParkingSearchRequest(
                37.4981,
                127.0279,
                OffsetDateTime.parse("2026-08-14T10:00:00+09:00"),
                OffsetDateTime.parse("2026-08-14T11:00:00+09:00")
        );
    }

    private ParkingLot parkingLot(long id, double latitude, double longitude) {
        ParkingLot lot = new ParkingLot();
        ReflectionTestUtils.setField(lot, "id", id);
        ReflectionTestUtils.setField(lot, "name", "주차장 " + id);
        ReflectionTestUtils.setField(lot, "address", "서울시 주소 " + id);
        ReflectionTestUtils.setField(lot, "latitude", latitude);
        ReflectionTestUtils.setField(lot, "longitude", longitude);
        return lot;
    }

    private ParkingOperation availableOperation(long parkingLotId) {
        ParkingOperation operation = new ParkingOperation();
        ReflectionTestUtils.setField(operation, "parkingLotId", parkingLotId);
        ReflectionTestUtils.setField(operation, "baseMinutes", 30);
        ReflectionTestUtils.setField(operation, "baseFee", 1_000);
        ReflectionTestUtils.setField(operation, "additionalMinutes", 10);
        ReflectionTestUtils.setField(operation, "additionalFee", 500);
        ReflectionTestUtils.setField(operation, "dailyMaxFee", null);
        ReflectionTestUtils.setField(operation, "fridayStatus", ParkingOperationStatus.ALL_DAY);
        return operation;
    }
}
