package jumin.domain.destination.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.mock;

import java.util.List;
import jumin.domain.destination.client.LocalSearchClient;
import jumin.domain.destination.client.LocalSearchPlace;
import jumin.domain.destination.client.LocalSearchResponse;
import jumin.domain.destination.dto.DestinationsResponse;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class DestinationServiceTest {

    @Test
    @DisplayName("검색어를 정규화하고 지역 검색 응답을 목적지 응답으로 변환한다")
    void normalizes_query_and_maps_local_search_response() {
        // given
        LocalSearchClient client = mock(LocalSearchClient.class);
        given(client.search("강남")).willReturn(new LocalSearchResponse(List.of(
                new LocalSearchPlace(
                        "<b>강남역</b>",
                        "서울 강남구 역삼동 858",
                        "서울 강남구 강남대로 396",
                        "1270279000",
                        "374981000"
                )
        )));

        // when
        DestinationsResponse response = new DestinationService(client).search("  강남  ");

        // then
        then(client).should().search("강남");
        assertThat(response.query()).isEqualTo("강남");
        assertThat(response.destinations()).singleElement().satisfies(destination -> {
            assertThat(destination.name()).isEqualTo("강남역");
            assertThat(destination.address()).isEqualTo("서울 강남구 역삼동 858");
            assertThat(destination.roadAddress()).isEqualTo("서울 강남구 강남대로 396");
            assertThat(destination.latitude()).isEqualTo(37.4981);
            assertThat(destination.longitude()).isEqualTo(127.0279);
            assertThat(destination.provider()).isEqualTo("NAVER");
            assertThat(destination.destinationId()).isEqualTo("naver_1270279000_374981000_강남역");
        });
    }

    @Test
    @DisplayName("검색어가 두 글자 미만이면 지역 검색 API를 호출하지 않는다")
    void rejects_short_query_without_calling_local_search() {
        // given
        LocalSearchClient client = mock(LocalSearchClient.class);

        // when & then
        assertThatThrownBy(() -> new DestinationService(client).search(" ㄱ "))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_QUERY)
                );
        then(client).shouldHaveNoInteractions();
    }

    @Test
    @DisplayName("지역 검색 결과가 없으면 빈 배열을 반환한다")
    void returns_empty_destinations_when_local_search_has_no_results() {
        // given
        LocalSearchClient client = mock(LocalSearchClient.class);
        given(client.search("강남")).willReturn(new LocalSearchResponse(List.of()));

        // when
        DestinationsResponse response = new DestinationService(client).search("강남");

        // then
        assertThat(response.destinations()).isEmpty();
    }
}
