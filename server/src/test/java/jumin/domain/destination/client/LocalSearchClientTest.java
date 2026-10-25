package jumin.domain.destination.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.anything;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import jumin.config.LocalSearchProperties;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClient.Builder;
import tools.jackson.databind.ObjectMapper;

class LocalSearchClientTest {
    private MockRestServiceServer mockRestServiceServer;
    private LocalSearchClient localSearchClient;

    @BeforeEach
    void setUp() {
        Builder restClientBuilder = RestClient.builder().baseUrl("https://dapi.kakao.com");
        mockRestServiceServer = MockRestServiceServer.bindTo(restClientBuilder).build();
        localSearchClient = new LocalSearchClient(
                restClientBuilder.build(),
                new LocalSearchProperties("https://dapi.kakao.com", "test-key"),
                new ObjectMapper()
        );
    }

    @Test
    @DisplayName("카카오 장소 검색에 인증 헤더와 원문 검색어, 위치 좌표를 전달한다")
    void sends_auth_original_query_and_coordinates() {
        mockRestServiceServer.expect(upstreamRequest -> {
            assertThat(upstreamRequest.getHeaders().getFirst("Authorization")).isEqualTo("KakaoAK test-key");
            assertThat(upstreamRequest.getURI().getPath()).isEqualTo("/v2/local/search/keyword.json");
            assertThat(upstreamRequest.getURI().getQuery()).contains("query=에버랜드", "x=127.111", "y=37.395",
                    "sort=accuracy", "size=15").doesNotContain("radius", "판교");
        }).andRespond(withSuccess("{\"documents\":[]}", MediaType.APPLICATION_JSON));
        assertThat(localSearchClient.search("에버랜드", 37.395, 127.111).places()).isEmpty();
        mockRestServiceServer.verify();
    }

    @Test
    @DisplayName("위치 좌표가 없으면 위치 조건과 검색 반경을 전달하지 않는다")
    void omits_location_when_unavailable() {
        mockRestServiceServer.expect(upstreamRequest -> assertThat(upstreamRequest.getURI().getQuery())
                        .doesNotContain("&x=", "&y=", "radius="))
                .andRespond(withSuccess("{\"documents\":[]}", MediaType.APPLICATION_JSON));
        localSearchClient.search("강남", null, null);
        mockRestServiceServer.verify();
    }

    @Test
    @DisplayName("외부 API의 요청 제한과 오류 응답을 비즈니스 예외로 변환한다")
    void maps_rate_limit_and_other_errors() {
        mockRestServiceServer.expect(anything()).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        assertSearchFailsWith(ErrorCode.DESTINATION_SEARCH_RATE_LIMITED);
        mockRestServiceServer.verify();
        mockRestServiceServer.reset();
        mockRestServiceServer.expect(anything()).andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        assertSearchFailsWith(ErrorCode.DESTINATION_SEARCH_CLIENT_FAILED);
        mockRestServiceServer.verify();
    }

    @Test
    @DisplayName("외부 API 응답이 비어 있거나 형식이 잘못되면 검색 실패 예외를 반환한다")
    void rejects_empty_malformed_or_incomplete_upstream_responses() {
        for (String upstreamResponseBody : new String[]{"", "not-json", "null", "{}", "{\"documents\":null}"}) {
            mockRestServiceServer.reset();
            mockRestServiceServer.expect(anything())
                    .andRespond(withSuccess(upstreamResponseBody, MediaType.APPLICATION_JSON));
            assertSearchFailsWith(ErrorCode.DESTINATION_SEARCH_CLIENT_FAILED);
            mockRestServiceServer.verify();
        }
    }

    @Test
    @DisplayName("API 키가 없으면 HTTP 요청 없이 검색 실패 예외를 반환한다")
    void missing_key_fails_without_http_request() {
        LocalSearchClient unauthenticatedSearchClient = new LocalSearchClient(
                RestClient.create(),
                new LocalSearchProperties("https://dapi.kakao.com", ""),
                new ObjectMapper()
        );
        assertThatThrownBy(() -> unauthenticatedSearchClient.search("강남", null, null))
                .isInstanceOf(BusinessException.class);
    }

    private void assertSearchFailsWith(ErrorCode expectedErrorCode) {
        assertThatThrownBy(() -> localSearchClient.search("강남", null, null))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(expectedErrorCode));
    }
}
