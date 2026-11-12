package jumin.domain.destination.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.mock;

import java.util.List;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import jumin.domain.destination.client.LocalSearchClient;
import jumin.domain.destination.client.LocalSearchPlace;
import jumin.domain.destination.client.LocalSearchResponse;
import jumin.domain.destination.dto.DestinationSearchRequest;
import jumin.domain.destination.dto.DestinationsResponse;
import jumin.domain.destination.mapper.DestinationResponseMapper;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parking.repository.ParkingLotRepository;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.transaction.CannotCreateTransactionException;

// 한 원천의 장애가 다른 원천의 검색 결과를 없애지 않으며, 정상 0건과 장애를 구분한다.
class DestinationServiceTest {

    private static final long PARKING_LOT_ID = 42L;

    private final LocalSearchClient localSearchClient = mock(LocalSearchClient.class);
    private final ParkingLotRepository parkingLotRepository = mock(ParkingLotRepository.class);
    private final DestinationService destinationService = new DestinationService(
            localSearchClient,
            new DestinationResponseMapper(),
            parkingLotRepository
    );

    @Test
    @DisplayName("검색어의 앞뒤 공백을 제거하고 장소 검색 결과 15개를 목적지 응답으로 변환한다")
    void preserves_query_and_maps_decimal_coordinates_without_truncating_to_five() {
        // given
        List<LocalSearchPlace> localSearchPlaces = IntStream.range(0, 15)
                .mapToObj(index -> createLocalSearchPlace(String.valueOf(index), "127.0279", "37.4981"))
                .toList();
        given(localSearchClient.search("에버랜드", 37.395, 127.111))
                .willReturn(new LocalSearchResponse(localSearchPlaces));

        // when
        DestinationsResponse destinationSearchResponse = destinationService.search(
                new DestinationSearchRequest("  에버랜드  ", 37.395, 127.111)
        );
        // then
        then(localSearchClient).should().search("에버랜드", 37.395, 127.111);
        assertThat(destinationSearchResponse.query()).isEqualTo("에버랜드");
        assertThat(destinationSearchResponse.destinations()).hasSize(15);
        assertThat(destinationSearchResponse.destinations().getFirst()).satisfies(destination -> {
            assertThat(destination.destinationId()).isEqualTo("kakao_0");
            assertThat(destination.provider()).isEqualTo("KAKAO");
            assertThat(destination.latitude()).isEqualTo(37.4981);
            assertThat(destination.longitude()).isEqualTo(127.0279);
            assertThat(destination.roadAddress()).isNull();
        });
    }

    @Test
    @DisplayName("유효하지 않은 좌표를 가진 장소를 검색 결과에서 제외한다")
    void filters_invalid_coordinates() {
        // given
        given(localSearchClient.search("강남", null, null)).willReturn(new LocalSearchResponse(
                List.of(createLocalSearchPlace("1", "NaN", "37"),
                        createLocalSearchPlace("2", "127", "91"),
                        createLocalSearchPlace("3", "127", "Infinity"),
                        createLocalSearchPlace("missing-latitude", "127", null),
                        createLocalSearchPlace("missing-longitude", null, "37"),
                        createLocalSearchPlace("invalid-number", "abc", "37"),
                        createLocalSearchPlace("4", "127", "37"))));

        // when
        DestinationsResponse destinationSearchResponse = destinationService.search(
                new DestinationSearchRequest("강남", null, null)
        );
        // then
        assertThat(destinationSearchResponse.destinations())
                .extracting(destination -> destination.destinationId())
                .containsExactly("kakao_4");
    }

    @Test
    @DisplayName("검색 결과가 없으면 빈 목적지 목록을 반환한다")
    void returns_empty_destinations() {
        // given
        given(localSearchClient.search("없는장소", null, null)).willReturn(new LocalSearchResponse(List.of()));

        // when
        DestinationsResponse destinationSearchResponse = destinationService.search(
                new DestinationSearchRequest("없는장소", null, null)
        );
        // then
        assertThat(destinationSearchResponse.destinations()).isEmpty();
        assertThat(destinationSearchResponse.parkingLots()).isEmpty();
    }

    @Test
    @DisplayName("검색어가 없거나 두 글자 미만이면 외부 API를 호출하지 않는다")
    void rejects_short_or_missing_query_without_upstream_call() {
        // given & when & then
        for (String searchQuery : new String[]{null, " ㄱ "}) {
            assertThatThrownBy(() -> destinationService.search(
                    new DestinationSearchRequest(searchQuery, null, null)
            ))
                    .isInstanceOfSatisfying(BusinessException.class, ex ->
                            assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_QUERY));
        }
        then(localSearchClient).shouldHaveNoInteractions();
        then(parkingLotRepository).shouldHaveNoInteractions();
    }

    @Test
    @DisplayName("카카오 장소와 이름으로 찾은 DB 주차장을 별도 목록으로 반환한다")
    void separates_parking_lots_from_kakao_destinations() {
        // given
        ParkingLot parkingLot = mock(ParkingLot.class);
        given(parkingLot.getId()).willReturn(42L);
        given(parkingLot.getName()).willReturn("강남 공영주차장");
        given(parkingLot.getAddress()).willReturn(null);
        given(parkingLot.getLatitude()).willReturn(37.5);
        given(parkingLot.getLongitude()).willReturn(127.0);
        given(parkingLotRepository.findActiveByNameContaining("강남")).willReturn(List.of(parkingLot));
        given(localSearchClient.search("강남", null, null)).willReturn(new LocalSearchResponse(
                List.of(createLocalSearchPlace("1", "127", "37"))));

        // when
        DestinationsResponse response = destinationService.search(
                new DestinationSearchRequest("  강남  ", null, null));

        // then
        then(parkingLotRepository).should().findActiveByNameContaining("강남");
        assertThat(response.destinations()).hasSize(1);
        assertThat(response.destinations().getFirst().destinationId()).isEqualTo("kakao_1");
        assertThat(response.parkingLots()).singleElement().satisfies(result -> {
            assertThat(result.parkingLotId()).isEqualTo(42L);
            assertThat(result.name()).isEqualTo("강남 공영주차장");
            assertThat(result.address()).isNull();
            assertThat(result.latitude()).isEqualTo(37.5);
            assertThat(result.longitude()).isEqualTo(127.0);
        });
    }

    @Test
    @DisplayName("카카오 검색 결과가 없어도 DB 주차장 결과를 반환한다")
    void returns_parking_lots_without_kakao_results() {
        // given
        ParkingLot parkingLot = mock(ParkingLot.class);
        given(parkingLot.getId()).willReturn(42L);
        given(parkingLot.getName()).willReturn("강남 공영주차장");
        given(parkingLot.getLatitude()).willReturn(37.5);
        given(parkingLot.getLongitude()).willReturn(127.0);
        given(parkingLotRepository.findActiveByNameContaining("강남")).willReturn(List.of(parkingLot));
        given(localSearchClient.search("강남", null, null)).willReturn(new LocalSearchResponse(List.of()));

        // when
        DestinationsResponse response = destinationService.search(
                new DestinationSearchRequest("강남", null, null));

        // then
        assertThat(response.destinations()).isEmpty();
        assertThat(response.parkingLots()).hasSize(1);
    }

    @ParameterizedTest
    @EnumSource(value = ErrorCode.class, names = {"DESTINATION_SEARCH_CLIENT_FAILED", "DESTINATION_SEARCH_RATE_LIMITED"})
    @DisplayName("카카오 조회에 실패해도 DB 주차장 결과를 유지한다")
    void returns_parking_lots_when_kakao_fails(ErrorCode errorCode) {
        // given
        given(localSearchClient.search("강남", null, null)).willThrow(new BusinessException(errorCode));
        ParkingLot parkingLot = createParkingLot();
        given(parkingLotRepository.findActiveByNameContaining("강남")).willReturn(List.of(parkingLot));

        // when
        DestinationsResponse response = destinationService.search(new DestinationSearchRequest("  강남  ", null, null));

        // then
        assertThat(response.query()).isEqualTo("강남");
        assertThat(response.destinations()).isEmpty();
        assertThat(response.parkingLots()).singleElement().satisfies(result -> {
            assertThat(result.parkingLotId()).isEqualTo(PARKING_LOT_ID);
            assertThat(result.name()).isEqualTo("강남 공영주차장");
            assertThat(result.latitude()).isEqualTo(37.5);
            assertThat(result.longitude()).isEqualTo(127.0);
        });
    }

    @Test
    @DisplayName("카카오 조회 실패와 DB 정상 0건은 빈 목록으로 성공한다")
    void treats_empty_parking_results_as_success_when_kakao_fails() {
        // given
        given(localSearchClient.search("강남", null, null))
                .willThrow(new BusinessException(ErrorCode.DESTINATION_SEARCH_CLIENT_FAILED));
        given(parkingLotRepository.findActiveByNameContaining("강남")).willReturn(List.of());

        // when
        DestinationsResponse response = destinationService.search(new DestinationSearchRequest("강남", null, null));

        // then
        assertThat(response.destinations()).isEmpty();
        assertThat(response.parkingLots()).isEmpty();
    }

    @ParameterizedTest
    @MethodSource("parkingSearchFailures")
    @DisplayName("DB 조회나 연결에 실패해도 카카오 장소 결과를 유지한다")
    void returns_kakao_results_when_parking_search_fails(RuntimeException databaseFailure) {
        // given
        given(localSearchClient.search("강남", null, null)).willReturn(new LocalSearchResponse(
                List.of(createLocalSearchPlace("1", "127", "37"))));
        given(parkingLotRepository.findActiveByNameContaining("강남")).willThrow(databaseFailure);

        // when
        DestinationsResponse response = destinationService.search(new DestinationSearchRequest("강남", null, null));

        // then
        assertThat(response.destinations()).singleElement().satisfies(result -> {
            assertThat(result.destinationId()).isEqualTo("kakao_1");
            assertThat(result.latitude()).isEqualTo(37.0);
            assertThat(result.longitude()).isEqualTo(127.0);
        });
        assertThat(response.parkingLots()).isEmpty();
    }

    @Test
    @DisplayName("카카오 정상 0건과 DB 조회 실패는 빈 목록으로 성공한다")
    void treats_empty_kakao_results_as_success_when_parking_search_fails() {
        // given
        given(localSearchClient.search("강남", null, null)).willReturn(new LocalSearchResponse(List.of()));
        given(parkingLotRepository.findActiveByNameContaining("강남"))
                .willThrow(new DataAccessResourceFailureException("test database unavailable"));

        // when
        DestinationsResponse response = destinationService.search(new DestinationSearchRequest("강남", null, null));

        // then
        assertThat(response.destinations()).isEmpty();
        assertThat(response.parkingLots()).isEmpty();
    }

    @ParameterizedTest
    @EnumSource(value = ErrorCode.class, names = {"DESTINATION_SEARCH_CLIENT_FAILED", "DESTINATION_SEARCH_RATE_LIMITED"})
    @DisplayName("카카오와 DB 조회가 모두 실패하면 전체 검색 오류를 반환한다")
    void fails_when_both_sources_fail(ErrorCode kakaoErrorCode) {
        // given
        given(localSearchClient.search("강남", null, null)).willThrow(new BusinessException(kakaoErrorCode));
        given(parkingLotRepository.findActiveByNameContaining("강남"))
                .willThrow(new DataAccessResourceFailureException("test database unavailable"));

        // when & then
        assertThatThrownBy(() -> destinationService.search(new DestinationSearchRequest("강남", null, null)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.DESTINATION_SEARCH_UNAVAILABLE));
    }

    @Test
    @DisplayName("카카오 조회 장애가 아닌 비즈니스 오류를 빈 결과로 바꾸지 않는다")
    void propagates_unrelated_business_error() {
        // given
        BusinessException unexpectedFailure = new BusinessException(ErrorCode.INVALID_INPUT);
        given(localSearchClient.search("강남", null, null)).willThrow(unexpectedFailure);

        // when & then
        assertThatThrownBy(() -> destinationService.search(new DestinationSearchRequest("강남", null, null)))
                .isSameAs(unexpectedFailure);
        then(parkingLotRepository).shouldHaveNoInteractions();
    }

    @Test
    @DisplayName("카카오 호출 중 예상하지 못한 오류를 빈 결과로 바꾸지 않는다")
    void propagates_unexpected_kakao_error() {
        // given
        IllegalStateException unexpectedFailure = new IllegalStateException("test unexpected failure");
        given(localSearchClient.search("강남", null, null)).willThrow(unexpectedFailure);

        // when & then
        assertThatThrownBy(() -> destinationService.search(new DestinationSearchRequest("강남", null, null)))
                .isSameAs(unexpectedFailure);
        then(parkingLotRepository).shouldHaveNoInteractions();
    }

    @Test
    @DisplayName("카카오 조회 실패 후에도 DB의 관련 없는 오류를 전체 검색 장애로 숨기지 않는다")
    void propagates_unexpected_repository_error() {
        // given
        given(localSearchClient.search("강남", null, null))
                .willThrow(new BusinessException(ErrorCode.DESTINATION_SEARCH_CLIENT_FAILED));
        IllegalStateException unexpectedFailure = new IllegalStateException("test unexpected failure");
        given(parkingLotRepository.findActiveByNameContaining("강남")).willThrow(unexpectedFailure);

        // when & then
        assertThatThrownBy(() -> destinationService.search(new DestinationSearchRequest("강남", null, null)))
                .isSameAs(unexpectedFailure);
    }

    @Test
    @DisplayName("조회 후 응답 변환 오류를 원천 조회 실패로 숨기지 않는다")
    void propagates_mapping_error() {
        // given
        LocalSearchResponse kakaoResponse = new LocalSearchResponse(List.of());
        given(localSearchClient.search("강남", null, null)).willReturn(kakaoResponse);
        given(parkingLotRepository.findActiveByNameContaining("강남")).willReturn(List.of());
        DestinationResponseMapper responseMapper = mock(DestinationResponseMapper.class);
        IllegalStateException unexpectedFailure = new IllegalStateException("test mapping failure");
        given(responseMapper.toResponse("강남", kakaoResponse, List.of())).willThrow(unexpectedFailure);
        DestinationService service = new DestinationService(localSearchClient, responseMapper, parkingLotRepository);

        // when & then
        assertThatThrownBy(() -> service.search(new DestinationSearchRequest("강남", null, null)))
                .isSameAs(unexpectedFailure);
    }

    private static Stream<RuntimeException> parkingSearchFailures() {
        return Stream.of(
                new DataAccessResourceFailureException("test database unavailable"),
                new CannotCreateTransactionException("test database connection unavailable")
        );
    }

    private ParkingLot createParkingLot() {
        ParkingLot parkingLot = mock(ParkingLot.class);
        given(parkingLot.getId()).willReturn(PARKING_LOT_ID);
        given(parkingLot.getName()).willReturn("강남 공영주차장");
        given(parkingLot.getLatitude()).willReturn(37.5);
        given(parkingLot.getLongitude()).willReturn(127.0);
        return parkingLot;
    }

    private LocalSearchPlace createLocalSearchPlace(
            String placeId,
            String longitude,
            String latitude
    ) {
        return new LocalSearchPlace(placeId, "테스트 장소", "경기 용인시", "", longitude, latitude);
    }
}
