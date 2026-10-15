package jumin.domain.parking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import jumin.domain.parking.dto.ParkingLotResponse;
import jumin.domain.parking.dto.ParkingLotViewportDetailResponse;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.domain.parking.dto.ParkingSearchResponse;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.domain.parking.dto.ParkingLotViewportResponse;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parking.entity.ParkingOperation;
import jumin.domain.parking.entity.ParkingOperationStatus;
import jumin.domain.parking.repository.ParkingLotRepository;
import jumin.domain.parking.repository.ParkingLotLikeRepository;
import jumin.domain.parking.repository.ParkingLotLikeResult;
import jumin.domain.parking.repository.ParkingOperationRepository;
import jumin.domain.walking.service.WalkingDistanceService;
import jumin.domain.walking.service.WalkingDistanceResult;
import jumin.domain.walking.service.WalkingDurationCalculator;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

class ParkingSearchServiceTest {

    private static final UUID GUEST_ID = UUID.fromString("550e8400-e29b-41d4-a716-446655440000");

    private final ParkingLotRepository parkingLotRepository = mock(ParkingLotRepository.class);
    private final ParkingLotLikeRepository parkingLotLikeRepository = mock(ParkingLotLikeRepository.class);
    private final ParkingOperationRepository parkingOperationRepository = mock(ParkingOperationRepository.class);
    private final WalkingDistanceService walkingDistanceService = mock(WalkingDistanceService.class);
    private final Clock clock = mock(Clock.class);
    private ParkingSearchService service;

    @BeforeEach
    void setUp() {
        service = new ParkingSearchService(
                parkingLotRepository,
                parkingLotLikeRepository,
                parkingOperationRepository,
                new ParkingSearchQueryValidator(),
                new ParkingOperationEvaluator(),
                new ParkingBalancedScoreCalculator(),
                new ParkingLodScoreCalculator(),
                clock,
                walkingDistanceService,
                new WalkingDurationCalculator()
        );
        when(clock.instant()).thenReturn(Instant.parse("2026-10-13T03:00:00Z"));
        when(walkingDistanceService.findDistances(anyDouble(), anyDouble(), anyList()))
                .thenAnswer(invocation -> {
                    List<ParkingLot> parkingLots = invocation.getArgument(2);
                    return new WalkingDistanceResult(parkingLots.stream()
                            .collect(Collectors.toMap(ParkingLot::getId, ignored -> 500)));
                });
        when(parkingLotLikeRepository.findSummary(1L, GUEST_ID))
                .thenReturn(new ParkingLotLikeResult(0L, false));
    }

    @Test
    @DisplayName("도보거리와 요금, 운영 상태, 균형점수를 응답에 매핑한다")
    void maps_walking_distance_fee_availability_and_balanced_score() {
        // given
        ParkingLot first = parkingLot(1L, 37.4982, 127.0280);
        ParkingLot second = parkingLot(2L, 37.4983, 127.0281);
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenReturn(List.of(first, second));
        when(parkingOperationRepository.findAllByParkingLotIdIn(anyList()))
                .thenReturn(List.of(availableOperation(1L), availableOperation(2L)));
        when(walkingDistanceService.findDistances(anyDouble(), anyDouble(), anyList()))
                .thenReturn(new WalkingDistanceResult(Map.of(1L, 14, 2L, 28)));

        // when
        ParkingSearchResponse result = service.search(validQuery());

        // then
        assertThat(result.totalCount()).isEqualTo(2);
        assertThat(result.parkingLots()).extracting(ParkingLotResponse::distanceMeters)
                .containsExactlyInAnyOrder(14, 28);
        assertThat(result.parkingLots()).extracting(ParkingLotResponse::walkingDurationMinutes)
                .containsExactlyInAnyOrder(1, 1);
        assertThat(result.parkingLots()).extracting(ParkingLotResponse::estimatedFee).containsOnly(2_500);
        assertThat(result.parkingLots()).extracting(ParkingLotResponse::availabilityStatus).containsOnly("AVAILABLE");
        assertThat(result.parkingLots()).extracting(ParkingLotResponse::balancedScore)
                .containsExactlyInAnyOrder(0.1506, 0.1622);
        verify(parkingOperationRepository).findAllByParkingLotIdIn(List.of(1L, 2L));
    }

    @Test
    @DisplayName("직선거리 후보는 도보거리가 600m를 넘어도 반환한다")
    void returns_candidates_even_when_walking_distance_exceeds_radius() {
        // given
        ParkingLot first = parkingLot(1L, 37.4982, 127.0280);
        ParkingLot second = parkingLot(2L, 37.4983, 127.0281);
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenReturn(List.of(first, second));
        when(parkingOperationRepository.findAllByParkingLotIdIn(anyList()))
                .thenReturn(List.of(availableOperation(1L), availableOperation(2L)));
        when(walkingDistanceService.findDistances(anyDouble(), anyDouble(), anyList()))
                .thenReturn(new WalkingDistanceResult(Map.of(1L, 500, 2L, 700)));

        // when
        ParkingSearchResponse result = service.search(validQuery());

        // then
        assertThat(result.totalCount()).isEqualTo(2);
        assertThat(result.parkingLots()).extracting(ParkingLotResponse::distanceMeters)
                .containsExactlyInAnyOrder(500, 700);
        assertThat(result.parkingLots()).extracting(ParkingLotResponse::walkingDurationMinutes)
                .containsExactlyInAnyOrder(8, 11);
    }

    @Test
    @DisplayName("보행망이 준비되지 않으면 직선거리로 대체하지 않고 실패한다")
    void fails_when_walking_network_is_unavailable() {
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenReturn(List.of(parkingLot(1L, 37.4982, 127.0280)));
        when(walkingDistanceService.findDistances(anyDouble(), anyDouble(), anyList()))
                .thenThrow(new BusinessException(ErrorCode.WALKING_NETWORK_UNAVAILABLE));

        assertThatThrownBy(() -> service.search(validQuery()))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.WALKING_NETWORK_UNAVAILABLE);
    }

    @Test
    @DisplayName("도보 경로가 없는 후보도 직선거리 후보면 반환한다")
    void returns_candidate_without_walking_route() {
        // given
        ParkingLot outside = parkingLot(3L, 37.5040, 127.0279);
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenReturn(List.of(outside));
        when(parkingOperationRepository.findAllByParkingLotIdIn(anyList()))
                .thenReturn(List.of(availableOperation(3L)));
        when(walkingDistanceService.findDistances(anyDouble(), anyDouble(), anyList()))
                .thenReturn(new WalkingDistanceResult(Map.of()));

        // when
        ParkingSearchResponse result = service.search(validQuery());

        // then
        assertThat(result.totalCount()).isOne();
        assertThat(result.parkingLots().getFirst().distanceMeters()).isNull();
        assertThat(result.parkingLots().getFirst().walkingDurationMinutes()).isNull();
        assertThat(result.parkingLots().getFirst().balancedScore()).isNull();
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
        verify(parkingLotRepository).findActiveWithinRadius(anyDouble(), anyDouble(), eq(600));
        verifyNoInteractions(parkingOperationRepository);
    }

    @Test
    @DisplayName("운영정보가 없는 후보는 운영 확인 필요 상태로 반환한다")
    void returns_unknown_when_operation_is_missing_for_candidate() {
        // given
        ParkingLot candidate = parkingLot(4L, 37.4982, 127.0280);
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenReturn(List.of(candidate));
        when(parkingOperationRepository.findAllByParkingLotIdIn(anyList()))
                .thenReturn(List.of());

        // when
        ParkingLotResponse result = service.search(validQuery()).parkingLots().getFirst();

        // then
        assertThat(result.availabilityStatus()).isEqualTo("UNKNOWN");
        assertThat(result.estimatedFee()).isNull();
        assertThat(result.balancedScore()).isNull();
    }

    @Test
    @DisplayName("운영 불가 후보도 요금은 반환하고 균형점수는 생략한다")
    void returns_fee_without_score_when_operation_is_unavailable() {
        // given
        ParkingLot candidate = parkingLot(5L, 37.4982, 127.0280);
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenReturn(List.of(candidate));
        when(parkingOperationRepository.findAllByParkingLotIdIn(anyList()))
                .thenReturn(List.of(unavailableOperation(5L)));

        // when
        ParkingLotResponse result = service.search(validQuery()).parkingLots().getFirst();

        // then
        assertThat(result.availabilityStatus()).isEqualTo("UNAVAILABLE");
        assertThat(result.estimatedFee()).isEqualTo(2_500);
        assertThat(result.balancedScore()).isNull();
    }

    @Test
    @DisplayName("토요일 무료 주차장은 예상 요금을 0원으로 반환한다")
    void returns_zero_fee_for_saturday_free_status() {
        // given
        ParkingLot candidate = parkingLot(6L, 37.4982, 127.0280);
        ParkingOperation operation = availableOperation(6L);
        ReflectionTestUtils.setField(operation, "saturdayPaid", false);
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenReturn(List.of(candidate));
        when(parkingOperationRepository.findAllByParkingLotIdIn(anyList()))
                .thenReturn(List.of(operation));
        when(walkingDistanceService.findDistances(anyDouble(), anyDouble(), anyList()))
                .thenReturn(new WalkingDistanceResult(Map.of(6L, 14)));

        // when
        ParkingLotResponse result = service.search(query(
                "2026-08-22T10:00:00+09:00",
                "2026-08-22T11:00:00+09:00"
        )).parkingLots().getFirst();

        // then
        assertThat(result.availabilityStatus()).isEqualTo("AVAILABLE");
        assertThat(result.estimatedFee()).isZero();
        assertThat(result.balancedScore()).isEqualTo(0.0117);
    }

    @Test
    @DisplayName("일요일·공휴일 무료 주차장은 예상 요금을 0원으로 반환한다")
    void returns_zero_fee_for_holiday_free_status() {
        // given
        ParkingLot candidate = parkingLot(7L, 37.4982, 127.0280);
        ParkingOperation operation = availableOperation(7L);
        ReflectionTestUtils.setField(operation, "holidayPaid", false);
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenReturn(List.of(candidate));
        when(parkingOperationRepository.findAllByParkingLotIdIn(anyList()))
                .thenReturn(List.of(operation));
        when(walkingDistanceService.findDistances(anyDouble(), anyDouble(), anyList()))
                .thenReturn(new WalkingDistanceResult(Map.of(7L, 14)));

        // when
        ParkingLotResponse result = service.search(query(
                "2026-08-23T10:00:00+09:00",
                "2026-08-23T11:00:00+09:00"
        )).parkingLots().getFirst();

        // then
        assertThat(result.availabilityStatus()).isEqualTo("AVAILABLE");
        assertThat(result.estimatedFee()).isZero();
        assertThat(result.balancedScore()).isEqualTo(0.0117);
    }

    @Test
    @DisplayName("날짜별 유료 여부가 없으면 예상 요금을 계산하지 않는다")
    void returns_null_fee_when_paid_status_is_unknown() {
        // given
        ParkingLot candidate = parkingLot(8L, 37.4982, 127.0280);
        ParkingOperation operation = availableOperation(8L);
        ReflectionTestUtils.setField(operation, "weekdayPaid", null);
        when(parkingLotRepository.findActiveWithinRadius(anyDouble(), anyDouble(), anyInt()))
                .thenReturn(List.of(candidate));
        when(parkingOperationRepository.findAllByParkingLotIdIn(anyList()))
                .thenReturn(List.of(operation));

        // when
        ParkingLotResponse result = service.search(validQuery()).parkingLots().getFirst();

        // then
        assertThat(result.availabilityStatus()).isEqualTo("AVAILABLE");
        assertThat(result.estimatedFee()).isNull();
        assertThat(result.balancedScore()).isNull();
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

    @Test
    @DisplayName("viewport 주차장별 LOD 점수를 반환하고 조회 순서를 유지한다")
    void maps_parking_lots_to_viewport_response() {
        // given
        ParkingLot first = parkingLotWithCapacity(1L, 50);
        ParkingLot second = parkingLotWithCapacity(2L, 200);
        when(parkingLotRepository.findActiveWithinViewport(
                126.9700,
                37.5600,
                126.9900,
                37.5750,
                false,
                false,
                2
        )).thenReturn(List.of(first, second));

        // when
        ParkingLotViewportResponses result = service.searchViewport(new ParkingLotViewportRequest(
                126.9700,
                37.5600,
                126.9900,
                37.5750,
                false,
                false
        ));

        // then
        assertThat(result.totalCount()).isEqualTo(2);
        assertThat(result.parkingLots()).extracting(ParkingLotViewportResponse::id).containsExactly(1L, 2L);
        assertThat(result.parkingLots()).extracting(ParkingLotViewportResponse::score).containsExactly(0.5, 0.8);
        assertThat(result.parkingLots().getFirst().latitude()).isEqualTo(37.5665);
        assertThat(result.parkingLots().getFirst().longitude()).isEqualTo(126.9780);
        verifyNoInteractions(parkingOperationRepository, walkingDistanceService);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(ints = {0, -1})
    @DisplayName("구획 수가 없거나 0 이하인 주차장도 0점으로 응답에 유지한다")
    void retains_parking_lot_with_zero_score(Integer capacity) {
        // given
        ParkingLot parkingLot = parkingLotWithCapacity(1L, capacity);
        when(parkingLotRepository.findActiveWithinViewport(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyBoolean(), anyBoolean(), anyInt()
        ))
                .thenReturn(List.of(parkingLot));

        // when
        ParkingLotViewportResponses result = service.searchViewport(new ParkingLotViewportRequest(
                126.9700, 37.5600, 126.9900, 37.5750, false, false
        ));

        // then
        assertThat(result.totalCount()).isEqualTo(1);
        assertThat(result.parkingLots()).hasSize(1);
        assertThat(result.parkingLots().getFirst().id()).isEqualTo(1L);
        assertThat(result.parkingLots().getFirst().score()).isZero();
    }

    @ParameterizedTest
    @CsvSource({"false, false", "true, false", "false, true", "true, true"})
    @DisplayName("필터를 조회에 전달하고 조회 결과의 개수와 LOD 점수를 반환한다")
    void returns_scored_results_for_viewport_filters(boolean freeOnly, boolean excludeMechanical) {
        // given
        ParkingLot parkingLot = parkingLotWithCapacity(1L, 50);
        when(parkingLotRepository.findActiveWithinViewport(
                126.9700, 37.5600, 126.9900, 37.5750, freeOnly, excludeMechanical, 2
        )).thenReturn(List.of(parkingLot));

        // when
        ParkingLotViewportResponses result = service.searchViewport(new ParkingLotViewportRequest(
                126.9700, 37.5600, 126.9900, 37.5750, freeOnly, excludeMechanical
        ));

        // then
        verify(parkingLotRepository).findActiveWithinViewport(
                126.9700, 37.5600, 126.9900, 37.5750, freeOnly, excludeMechanical, 2
        );
        assertThat(result.totalCount()).isEqualTo(1);
        assertThat(result.parkingLots().getFirst().score()).isEqualTo(0.5);
        verifyNoInteractions(parkingOperationRepository, walkingDistanceService);
    }

    @Test
    @DisplayName("viewport에 주차장이 없으면 개수 0과 빈 목록을 반환한다")
    void returns_empty_viewport_response() {
        // given
        when(parkingLotRepository.findActiveWithinViewport(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyBoolean(), anyBoolean(), anyInt()
        ))
                .thenReturn(List.of());

        // when
        ParkingLotViewportResponses result = service.searchViewport(new ParkingLotViewportRequest(
                126.9700, 37.5600, 126.9900, 37.5750, false, false
        ));

        // then
        assertThat(result.totalCount()).isZero();
        assertThat(result.parkingLots()).isEmpty();
        verifyNoInteractions(parkingOperationRepository, walkingDistanceService);
    }

    @Test
    @DisplayName("viewport와 후보 목록이 달라져도 같은 주차장은 같은 점수를 반환한다")
    void keeps_score_stable_across_viewports() {
        // given
        ParkingLot parkingLot = parkingLotWithCapacity(1L, 100);
        ParkingLot larger = parkingLotWithCapacity(2L, 1_000);
        when(parkingLotRepository.findActiveWithinViewport(
                126.9700, 37.5600, 126.9900, 37.5750, false, false, 2
        ))
                .thenReturn(List.of(parkingLot));
        when(parkingLotRepository.findActiveWithinViewport(
                126.9600, 37.5500, 127.0100, 37.5800, false, false, 2
        ))
                .thenReturn(List.of(larger, parkingLot));

        // when
        ParkingLotViewportResponses narrow = service.searchViewport(new ParkingLotViewportRequest(
                126.9700, 37.5600, 126.9900, 37.5750, false, false
        ));
        ParkingLotViewportResponses wide = service.searchViewport(new ParkingLotViewportRequest(
                126.9600, 37.5500, 127.0100, 37.5800, false, false
        ));

        // then
        assertThat(narrow.parkingLots().getFirst().score()).isEqualTo(0.6666666666666666);
        assertThat(wide.parkingLots().getLast()).isEqualTo(narrow.parkingLots().getFirst());
    }

    @ParameterizedTest
    @CsvSource({
            "2026-10-12T03:00:00Z, 1",
            "2026-10-13T03:00:00Z, 2",
            "2026-10-14T03:00:00Z, 3",
            "2026-10-15T03:00:00Z, 4",
            "2026-10-16T03:00:00Z, 5",
            "2026-10-17T03:00:00Z, 6",
            "2026-10-18T03:00:00Z, 7",
            "2026-10-16T14:59:59Z, 5",
            "2026-10-16T15:00:00Z, 6",
            "2026-10-17T15:00:00Z, 7",
            "2026-10-18T15:00:00Z, 1"
    })
    @DisplayName("한국 날짜의 오늘 요일을 무료 조회에 전달하고 한국 자정에 요일을 변경한다")
    void passes_today_to_free_filter(String instant, int dayOfWeek) {
        // given
        when(clock.instant()).thenReturn(Instant.parse(instant));
        when(parkingLotRepository.findActiveWithinViewport(
                126.9700, 37.5600, 126.9900, 37.5750, true, false, dayOfWeek
        )).thenReturn(List.of(parkingLotWithCapacity(1L, 50)));

        // when
        ParkingLotViewportResponses result = service.searchViewport(new ParkingLotViewportRequest(
                126.9700, 37.5600, 126.9900, 37.5750, true, false
        ));

        // then
        verify(clock).instant();
        verify(parkingLotRepository).findActiveWithinViewport(
                126.9700, 37.5600, 126.9900, 37.5750, true, false, dayOfWeek
        );
        assertThat(result.totalCount()).isEqualTo(1);
        assertThat(result.parkingLots().getFirst().score()).isEqualTo(0.5);
    }

    @Test
    @DisplayName("지도에서 선택한 주차장의 공통 요금과 일별 운영 정보를 반환한다")
    void returns_detail_for_viewport_parking_lot() {
        // given
        ParkingLot parkingLot = parkingLotWithDetails(1L, 37.5665, 126.9780);
        ParkingOperation operation = availableOperationWithDetails(1L);
        when(parkingLotRepository.findActiveById(1L)).thenReturn(Optional.of(parkingLot));
        when(parkingOperationRepository.findById(1L)).thenReturn(Optional.of(operation));

        // when
        when(parkingLotLikeRepository.findSummary(1L, GUEST_ID))
                .thenReturn(new ParkingLotLikeResult(3L, true));

        ParkingLotViewportDetailResponse result = service.getParkingLotDetail(1L, GUEST_ID);

        // then
        assertThat(result.id()).isEqualTo(1L);
        assertThat(result.name()).isEqualTo("주차장 1");
        assertThat(result.address()).isEqualTo("서울시 주소 1");
        assertThat(result.capacity()).isEqualTo(42);
        assertThat(result.likeCount()).isEqualTo(3);
        assertThat(result.likedByMe()).isTrue();
        assertThat(result.feeRule().baseFreeMinutes()).isZero();
        assertThat(result.feeRule().dailyMaxFee()).isEqualTo(30_000);
        assertThat(result.dailyOperations()).extracting("day")
                .containsExactly("WEEKDAY", "SATURDAY", "HOLIDAY");
        assertThat(result.dailyOperations().get(0).status()).isEqualTo("OPEN");
        assertThat(result.dailyOperations().get(0).paid()).isTrue();
        assertThat(result.dailyOperations().get(1).status()).isEqualTo("OPEN");
        assertThat(result.dailyOperations().get(1).paid()).isFalse();
        assertThat(result.dailyOperations().get(2).status()).isEqualTo("CLOSED");
        assertThat(result.dailyOperations().get(0).openTime()).isEqualTo("00:00");
        assertThat(result.dailyOperations().get(1).closeTime()).isEqualTo("18:00");
        assertThat(result.dailyOperations().get(2).openTime()).isNull();
    }

    @Test
    @DisplayName("운영 정보가 없는 주차장은 요금과 운영 시간을 null로 반환한다")
    void returns_null_fields_when_viewport_operation_is_missing() {
        // given
        when(parkingLotRepository.findActiveById(1L))
                .thenReturn(Optional.of(parkingLot(1L, 37.5665, 126.9780)));
        when(parkingOperationRepository.findById(1L)).thenReturn(Optional.empty());

        // when
        ParkingLotViewportDetailResponse result = service.getParkingLotDetail(1L, GUEST_ID);

        // then
        assertThat(result.feeRule()).isNull();
        assertThat(result.dailyOperations()).extracting("day")
                .containsExactly("WEEKDAY", "SATURDAY", "HOLIDAY");
        assertThat(result.dailyOperations()).allSatisfy(detail -> {
            assertThat(detail.status()).isEqualTo("UNKNOWN");
            assertThat(detail.openTime()).isNull();
            assertThat(detail.closeTime()).isNull();
            assertThat(detail.paid()).isNull();
        });
    }

    @Test
    @DisplayName("활성 주차장을 찾지 못하면 주차장 미존재 예외를 던진다")
    void throws_parking_lot_not_found_when_viewport_parking_lot_does_not_exist() {
        // given
        when(parkingLotRepository.findActiveById(999L)).thenReturn(Optional.empty());

        // when & then
        assertThatThrownBy(() -> service.getParkingLotDetail(999L, GUEST_ID))
                .isInstanceOf(BusinessException.class)
                .hasMessage(ErrorCode.PARKING_LOT_NOT_FOUND.getMessage());
    }

    @Test
    @DisplayName("서쪽 경도가 동쪽 경도보다 크면 DB를 호출하지 않고 400 오류를 반환한다")
    void rejects_reversed_longitude_bounds() {
        // given
        ParkingLotViewportRequest request = new ParkingLotViewportRequest(
                126.9900,
                37.5600,
                126.9700,
                37.5750,
                false,
                false
        );

        // when & then
        assertThatThrownBy(() -> service.searchViewport(request))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
        verifyNoInteractions(parkingLotRepository);
    }

    @Test
    @DisplayName("북쪽 위도가 남쪽 위도보다 작으면 DB를 호출하지 않고 400 오류를 반환한다")
    void rejects_reversed_latitude_bounds() {
        // given
        ParkingLotViewportRequest request = new ParkingLotViewportRequest(
                126.9700,
                37.5750,
                126.9900,
                37.5600,
                false,
                false
        );

        // when & then
        assertThatThrownBy(() -> service.searchViewport(request))
                .isInstanceOf(BusinessException.class)
                .extracting(exception -> ((BusinessException) exception).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
        verifyNoInteractions(parkingLotRepository);
    }

    private ParkingSearchRequest validQuery() {
        return query(
                "2026-08-14T10:00:00+09:00",
                "2026-08-14T11:00:00+09:00"
        );
    }

    private ParkingSearchRequest query(String entryAt, String exitAt) {
        return new ParkingSearchRequest(
                37.4981,
                127.0279,
                OffsetDateTime.parse(entryAt),
                OffsetDateTime.parse(exitAt)
        );
    }

    private ParkingLot parkingLotWithCapacity(long id, Integer capacity) {
        ParkingLot lot = parkingLot(id, 37.5665, 126.9780);
        ReflectionTestUtils.setField(lot, "capacity", capacity);
        return lot;
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
        ReflectionTestUtils.setField(operation, "weekdayPaid", true);
        ReflectionTestUtils.setField(operation, "saturdayPaid", true);
        ReflectionTestUtils.setField(operation, "holidayPaid", true);
        ReflectionTestUtils.setField(operation, "weekdayStatus", ParkingOperationStatus.OPEN);
        ReflectionTestUtils.setField(operation, "weekdayOpenTime", LocalTime.MIDNIGHT);
        ReflectionTestUtils.setField(operation, "weekdayCloseTime", LocalTime.MIDNIGHT);
        ReflectionTestUtils.setField(operation, "weekendStatus", ParkingOperationStatus.OPEN);
        ReflectionTestUtils.setField(operation, "weekendOpenTime", LocalTime.MIDNIGHT);
        ReflectionTestUtils.setField(operation, "weekendCloseTime", LocalTime.MIDNIGHT);
        ReflectionTestUtils.setField(operation, "holidayStatus", ParkingOperationStatus.OPEN);
        ReflectionTestUtils.setField(operation, "holidayOpenTime", LocalTime.MIDNIGHT);
        ReflectionTestUtils.setField(operation, "holidayCloseTime", LocalTime.MIDNIGHT);
        return operation;
    }

    private ParkingLot parkingLotWithDetails(long id, double latitude, double longitude) {
        ParkingLot lot = parkingLot(id, latitude, longitude);
        ReflectionTestUtils.setField(lot, "capacity", 42);
        return lot;
    }

    private ParkingOperation availableOperationWithDetails(long parkingLotId) {
        ParkingOperation operation = availableOperation(parkingLotId);
        ReflectionTestUtils.setField(operation, "baseFreeMinutes", 0);
        ReflectionTestUtils.setField(operation, "dailyMaxFee", 30_000);
        ReflectionTestUtils.setField(operation, "weekendOpenTime", LocalTime.of(9, 0));
        ReflectionTestUtils.setField(operation, "weekendCloseTime", LocalTime.of(18, 0));
        ReflectionTestUtils.setField(operation, "saturdayPaid", false);
        ReflectionTestUtils.setField(operation, "holidayStatus", ParkingOperationStatus.CLOSED);
        ReflectionTestUtils.setField(operation, "holidayOpenTime", null);
        ReflectionTestUtils.setField(operation, "holidayCloseTime", null);
        return operation;
    }

    private ParkingOperation unavailableOperation(long parkingLotId) {
        ParkingOperation operation = availableOperation(parkingLotId);
        ReflectionTestUtils.setField(operation, "weekdayStatus", ParkingOperationStatus.CLOSED);
        return operation;
    }
}
