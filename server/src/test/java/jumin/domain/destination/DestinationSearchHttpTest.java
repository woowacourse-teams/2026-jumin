package jumin.domain.destination;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import jumin.config.LocalSearchProperties;
import jumin.domain.destination.client.LocalSearchClient;
import jumin.domain.destination.controller.DestinationController;
import jumin.domain.destination.mapper.DestinationResponseMapper;
import jumin.domain.destination.service.DestinationService;
import jumin.domain.destination.service.ReverseGeocodingService;
import jumin.global.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

/** Controller -> service -> real HTTP client -> contract-based upstream stand-in. */
class DestinationSearchHttpTest {
    private HttpServer localSearchStubServer;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() throws Exception {
        localSearchStubServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        localSearchStubServer.createContext("/v2/local/search/keyword.json", httpExchange -> {
            assertThat(httpExchange.getRequestHeaders().getFirst("Authorization"))
                    .isEqualTo("KakaoAK http-test-only");
            String requestQueryString = httpExchange.getRequestURI().getQuery();
            assertThat(requestQueryString).contains("size=15", "sort=accuracy").doesNotContain("radius=");
            int responseStatusCode = 200;
            if (requestQueryString.contains("rate-limit")) {
                responseStatusCode = 429;
            } else if (requestQueryString.contains("upstream-error")) {
                responseStatusCode = 500;
            }

            String responseBody;
            if (requestQueryString.contains("malformed")) {
                responseBody = "<html>invalid</html>";
            } else {
                responseBody = "{\"documents\":[{\"id\":\"1\","
                        + "\"place_name\":\"에버랜드\",\"address_name\":\"경기 용인시\","
                        + "\"road_address_name\":\"\",\"x\":\"127.2\",\"y\":\"37.29\"}]}";
            }
            byte[] responseBodyBytes = responseBody.getBytes(StandardCharsets.UTF_8);
            httpExchange.getResponseHeaders().set("Content-Type", "application/json");
            httpExchange.sendResponseHeaders(responseStatusCode, responseBodyBytes.length);
            httpExchange.getResponseBody().write(responseBodyBytes);
            httpExchange.close();
        });
        localSearchStubServer.start();
        String localSearchBaseUrl = "http://127.0.0.1:" + localSearchStubServer.getAddress().getPort();
        LocalSearchProperties localSearchProperties = new LocalSearchProperties(localSearchBaseUrl, "http-test-only");
        LocalSearchClient localSearchClient = new LocalSearchClient(
                RestClient.builder().baseUrl(localSearchBaseUrl).build(),
                localSearchProperties,
                new ObjectMapper()
        );
        DestinationController destinationController = new DestinationController(
                new DestinationService(
                        localSearchClient,
                        new DestinationResponseMapper()
                ),
                Mockito.mock(ReverseGeocodingService.class)
        );
        mockMvc = MockMvcBuilders.standaloneSetup(destinationController)
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    @AfterEach
    void stop() {
        if (localSearchStubServer != null) {
            localSearchStubServer.stop(0);
        }
    }

    @Test
    @DisplayName("위치를 함께 전달해 원문 검색어로 목적지를 검색하고 장소 좌표를 반환한다")
    void searches_remote_destination_with_optional_location() throws Exception {
        mockMvc.perform(get("/api/destinations/search").param("query", "에버랜드")
                        .param("latitude", "37.395").param("longitude", "127.111"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.query").value("에버랜드"))
                .andExpect(jsonPath("$.destinations[0].provider").value("KAKAO"))
                .andExpect(jsonPath("$.destinations[0].latitude").value(37.29));
    }

    @Test
    @DisplayName("외부 API의 요청 제한과 오류 응답, 잘못된 JSON을 HTTP 오류로 변환한다")
    void maps_real_http_errors_and_unparseable_body() throws Exception {
        mockMvc.perform(get("/api/destinations/search").param("query", "rate-limit"))
                .andExpect(status().isTooManyRequests());
        for (String searchQuery : new String[]{"upstream-error", "malformed"}) {
            mockMvc.perform(get("/api/destinations/search").param("query", searchQuery))
                    .andExpect(status().isBadGateway());
        }
    }
}
