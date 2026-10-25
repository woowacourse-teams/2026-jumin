package jumin.domain.destination.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.mock;

import java.util.List;
import java.util.stream.IntStream;
import jumin.domain.destination.client.LocalSearchClient;
import jumin.domain.destination.client.LocalSearchPlace;
import jumin.domain.destination.client.LocalSearchResponse;
import jumin.domain.destination.dto.DestinationSearchRequest;
import jumin.domain.destination.dto.DestinationsResponse;
import jumin.domain.destination.mapper.DestinationResponseMapper;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class DestinationServiceTest {

    private final LocalSearchClient localSearchClient = mock(LocalSearchClient.class);
    private final DestinationService destinationService = new DestinationService(
            localSearchClient,
            new DestinationResponseMapper()
    );

    @Test
    @DisplayName("검색어의 앞뒤 공백을 제거하고 장소 검색 결과 15개를 목적지 응답으로 변환한다")
    void preserves_query_and_maps_decimal_coordinates_without_truncating_to_five() {
        List<LocalSearchPlace> localSearchPlaces = IntStream.range(0, 15)
                .mapToObj(index -> createLocalSearchPlace(String.valueOf(index), "127.0279", "37.4981"))
                .toList();
        given(localSearchClient.search("에버랜드", 37.395, 127.111))
                .willReturn(new LocalSearchResponse(localSearchPlaces));
        DestinationsResponse destinationSearchResponse = destinationService.search(
                new DestinationSearchRequest("  에버랜드  ", 37.395, 127.111)
        );
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
        given(localSearchClient.search("강남", null, null)).willReturn(new LocalSearchResponse(
                List.of(createLocalSearchPlace("1", "NaN", "37"),
                        createLocalSearchPlace("2", "127", "91"),
                        createLocalSearchPlace("3", "127", "Infinity"),
                        createLocalSearchPlace("missing-latitude", "127", null),
                        createLocalSearchPlace("missing-longitude", null, "37"),
                        createLocalSearchPlace("invalid-number", "abc", "37"),
                        createLocalSearchPlace("4", "127", "37"))));
        DestinationsResponse destinationSearchResponse = destinationService.search(
                new DestinationSearchRequest("강남", null, null)
        );
        assertThat(destinationSearchResponse.destinations())
                .extracting(destination -> destination.destinationId())
                .containsExactly("kakao_4");
    }

    @Test
    @DisplayName("검색 결과가 없으면 빈 목적지 목록을 반환한다")
    void returns_empty_destinations() {
        given(localSearchClient.search("없는장소", null, null)).willReturn(new LocalSearchResponse(List.of()));
        DestinationsResponse destinationSearchResponse = destinationService.search(
                new DestinationSearchRequest("없는장소", null, null)
        );
        assertThat(destinationSearchResponse.destinations()).isEmpty();
    }

    @Test
    @DisplayName("검색어가 없거나 두 글자 미만이면 외부 API를 호출하지 않는다")
    void rejects_short_or_missing_query_without_upstream_call() {
        for (String searchQuery : new String[]{null, " ㄱ "}) {
            assertThatThrownBy(() -> destinationService.search(
                    new DestinationSearchRequest(searchQuery, null, null)
            ))
                    .isInstanceOfSatisfying(BusinessException.class, ex ->
                            assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_QUERY));
        }
        then(localSearchClient).shouldHaveNoInteractions();
    }

    private LocalSearchPlace createLocalSearchPlace(
            String placeId,
            String longitude,
            String latitude
    ) {
        return new LocalSearchPlace(placeId, "테스트 장소", "경기 용인시", "", longitude, latitude);
    }
}
