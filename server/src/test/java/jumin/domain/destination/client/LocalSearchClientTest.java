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
import tools.jackson.databind.ObjectMapper;

class LocalSearchClientTest {

    private static final String LOCAL_SEARCH_BASE_URL = "https://naverapihub.apigw.ntruss.com";
    private static final String CLIENT_ID = "client-id";
    private static final String CLIENT_SECRET = "client-secret";

    private MockRestServiceServer server;
    private LocalSearchClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl(LOCAL_SEARCH_BASE_URL);
        server = MockRestServiceServer.bindTo(builder).build();
        client = new LocalSearchClient(
                builder.build(),
                new LocalSearchProperties(
                        LOCAL_SEARCH_BASE_URL,
                        CLIENT_ID,
                        CLIENT_SECRET
                ),
                new ObjectMapper()
        );
    }

    @Test
    @DisplayName("지역 검색 요청에 인증 헤더와 검색 조건을 전달한다")
    void sends_local_search_request() {
        // given
        server.expect(request -> {
                    assertThat(request.getURI().getPath()).isEqualTo("/search/v1/local");
                    assertThat(request.getURI().getQuery()).contains("query=강남");
                    assertThat(request.getURI().getQuery()).contains("display=5");
                    assertThat(request.getHeaders().getFirst("X-NCP-APIGW-API-KEY-ID")).isEqualTo(CLIENT_ID);
                    assertThat(request.getHeaders().getFirst("X-NCP-APIGW-API-KEY")).isEqualTo(CLIENT_SECRET);
                })
                .andRespond(withSuccess("""
                        {
                          "lastBuildDate": "Mon, 17 Aug 2026 13:11:06 +0900",
                          "total": 1,
                          "start": 1,
                          "display": 1,
                          "items": [{
                            "title": "강남구청",
                            "link": "http://www.gangnam.go.kr/",
                            "category": "공공,사회기관>구청",
                            "description": "",
                            "telephone": "",
                            "address": "서울특별시 강남구 삼성동 16-1 강남구청",
                            "roadAddress": "서울특별시 강남구 학동로 426 강남구청",
                            "mapx": "1270475020",
                            "mapy": "375173050"
                          }]
                        }
                        """, MediaType.parseMediaType("text/plain;charset=UTF-8")));

        // when
        LocalSearchResponse response = client.search("강남");

        // then
        assertThat(response.items()).singleElement()
                .extracting(LocalSearchPlace::title)
                .isEqualTo("강남구청");
        server.verify();
    }

    @Test
    @DisplayName("지역 검색 API가 요청 한도를 초과하면 429 비즈니스 오류로 변환한다")
    void maps_rate_limit_to_business_exception() {
        // given
        server.expect(anything())
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));

        // when & then
        assertThatThrownBy(() -> client.search("강남"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.DESTINATION_SEARCH_RATE_LIMITED)
                );
        server.verify();
    }

    @Test
    @DisplayName("지역 검색 API가 오류 응답을 반환하면 502 비즈니스 오류로 변환한다")
    void maps_error_to_business_exception() {
        // given
        server.expect(anything())
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        // when & then
        assertThatThrownBy(() -> client.search("강남"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.DESTINATION_SEARCH_CLIENT_FAILED)
                );
        server.verify();
    }
}
