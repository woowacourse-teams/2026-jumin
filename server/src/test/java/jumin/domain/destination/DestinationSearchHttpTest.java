package jumin.domain.destination;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;
import jumin.config.LocalSearchProperties;
import jumin.domain.destination.client.LocalSearchClient;
import jumin.domain.destination.controller.DestinationController;
import jumin.domain.destination.mapper.DestinationResponseMapper;
import jumin.domain.destination.service.DestinationService;
import jumin.domain.destination.service.ReverseGeocodingService;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parking.repository.ParkingLotRepository;
import jumin.global.exception.ErrorCode;
import jumin.global.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

// 실제 HTTP 카카오 대역과 DB 저장소 대역으로 부분 성공과 전체 실패의 응답 계약을 검증한다.
class DestinationSearchHttpTest {

    private static final long PARKING_LOT_ID = 42L;

    private final AtomicInteger upstreamRequestCount = new AtomicInteger();
    private final ParkingLotRepository parkingLotRepository = mock(ParkingLotRepository.class);
    private HttpServer localSearchStubServer;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() throws Exception {
        localSearchStubServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        localSearchStubServer.createContext("/v2/local/search/keyword.json", httpExchange -> {
            upstreamRequestCount.incrementAndGet();
            assertThat(httpExchange.getRequestHeaders().getFirst("Authorization"))
                    .isEqualTo("KakaoAK http-test-only");
            String requestQueryString = httpExchange.getRequestURI().getQuery();
            assertThat(requestQueryString).contains("size=15", "sort=accuracy").doesNotContain("radius=");
            int responseStatusCode = 200;
            if (requestQueryString.contains("rate-limit")) {
                responseStatusCode = 429;
            }
            if (requestQueryString.contains("upstream-error")) {
                responseStatusCode = 500;
            }

            String responseBody = "{\"documents\":[{\"id\":\"1\","
                    + "\"place_name\":\"에버랜드\",\"address_name\":\"경기 용인시\","
                    + "\"road_address_name\":\"\",\"x\":\"127.2\",\"y\":\"37.29\"}]}";
            if (requestQueryString.contains("malformed")) {
                responseBody = "<html>invalid</html>";
            }
            if (requestQueryString.contains("empty-results")) {
                responseBody = "{\"documents\":[]}";
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
                        new DestinationResponseMapper(),
                        parkingLotRepository
                ),
                mock(ReverseGeocodingService.class)
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
        // when & then
        mockMvc.perform(get("/api/destinations/search").param("query", "에버랜드")
                        .param("latitude", "37.395").param("longitude", "127.111"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.query").value("에버랜드"))
                .andExpect(jsonPath("$.destinations[0].provider").value("KAKAO"))
                .andExpect(jsonPath("$.destinations[0].latitude").value(37.29))
                .andExpect(jsonPath("$.parkingLots").isEmpty());
    }

    @Test
    @DisplayName("카카오 요청 제한과 오류 응답, 잘못된 JSON에도 DB 주차장 결과를 HTTP 200으로 유지한다")
    void keeps_parking_results_when_real_http_search_fails() throws Exception {
        // given
        ParkingLot parkingLot = createParkingLot();
        given(parkingLotRepository.findActiveByNameContaining(anyString())).willReturn(List.of(parkingLot));

        // when & then
        for (String searchQuery : new String[]{"rate-limit", "upstream-error", "malformed"}) {
            mockMvc.perform(get("/api/destinations/search").param("query", searchQuery))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.query").value(searchQuery))
                    .andExpect(jsonPath("$.destinations").isEmpty())
                    .andExpect(jsonPath("$.parkingLots[0].parkingLotId").value(PARKING_LOT_ID))
                    .andExpect(jsonPath("$.parkingLots[0].name").value("강남 공영주차장"));
        }
    }

    @ParameterizedTest
    @MethodSource("databaseSearchFailures")
    @DisplayName("DB 조회 장애나 타임아웃에도 카카오 결과를 HTTP 200으로 반환한다")
    void keeps_kakao_results_when_database_search_fails(DataAccessException failure) throws Exception {
        // given
        given(parkingLotRepository.findActiveByNameContaining("에버랜드"))
                .willThrow(failure);

        // when & then
        mockMvc.perform(get("/api/destinations/search").param("query", "에버랜드"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.destinations[0].destinationId").value("kakao_1"))
                .andExpect(jsonPath("$.destinations[0].name").value("에버랜드"))
                .andExpect(jsonPath("$.parkingLots").isArray())
                .andExpect(jsonPath("$.parkingLots").isEmpty());
    }

    private static Stream<DataAccessException> databaseSearchFailures() {
        return Stream.of(
                new DataAccessResourceFailureException("test database unavailable"),
                new QueryTimeoutException("test database query timed out")
        );
    }

    @Test
    @DisplayName("카카오와 DB가 모두 실패하면 빈 성공 응답 대신 HTTP 503 오류를 반환한다")
    void returns_service_unavailable_when_both_sources_fail() throws Exception {
        // given
        given(parkingLotRepository.findActiveByNameContaining(anyString()))
                .willThrow(new DataAccessResourceFailureException("test database unavailable"));

        // when & then
        for (String searchQuery : new String[]{"rate-limit", "upstream-error", "malformed"}) {
            mockMvc.perform(get("/api/destinations/search").param("query", searchQuery))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(jsonPath("$.message").value(ErrorCode.DESTINATION_SEARCH_UNAVAILABLE.getMessage()))
                    .andExpect(jsonPath("$.errors").isEmpty())
                    .andExpect(jsonPath("$.destinations").doesNotExist())
                    .andExpect(jsonPath("$.parkingLots").doesNotExist());
        }
    }

    @Test
    @DisplayName("카카오 장애 시 DB의 정상 0건은 HTTP 200 성공으로 처리한다")
    void accepts_empty_database_results_when_kakao_fails() throws Exception {
        // given
        given(parkingLotRepository.findActiveByNameContaining("upstream-error")).willReturn(List.of());

        // when & then
        mockMvc.perform(get("/api/destinations/search").param("query", "upstream-error"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.destinations").isEmpty())
                .andExpect(jsonPath("$.parkingLots").isEmpty());
    }

    @Test
    @DisplayName("DB 장애 시 카카오의 정상 0건은 HTTP 200 성공으로 처리한다")
    void accepts_empty_kakao_results_when_database_fails() throws Exception {
        // given
        given(parkingLotRepository.findActiveByNameContaining("empty-results"))
                .willThrow(new DataAccessResourceFailureException("test database unavailable"));

        // when & then
        mockMvc.perform(get("/api/destinations/search").param("query", "empty-results"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.destinations").isEmpty())
                .andExpect(jsonPath("$.parkingLots").isEmpty());
    }

    @Test
    @DisplayName("두 원천이 모두 정상 0건이면 HTTP 200과 빈 목록을 반환한다")
    void accepts_both_sources_returning_empty_results() throws Exception {
        // given
        given(parkingLotRepository.findActiveByNameContaining("empty-results")).willReturn(List.of());

        // when & then
        mockMvc.perform(get("/api/destinations/search").param("query", "empty-results"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.query").value("empty-results"))
                .andExpect(jsonPath("$.destinations").isEmpty())
                .andExpect(jsonPath("$.parkingLots").isEmpty());
    }

    @Test
    @DisplayName("잘못된 검색어나 일부 누락된 좌표는 원천 조회 없이 HTTP 400으로 거절한다")
    void rejects_invalid_input_before_searching_sources() throws Exception {
        // when & then
        mockMvc.perform(get("/api/destinations/search"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(ErrorCode.INVALID_QUERY.getMessage()));
        mockMvc.perform(get("/api/destinations/search").param("query", "ㄱ"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/destinations/search").param("query", "강남").param("latitude", "37"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/destinations/search").param("query", "강남")
                        .param("latitude", "91").param("longitude", "127"))
                .andExpect(status().isBadRequest());
        assertThat(upstreamRequestCount).hasValue(0);
        then(parkingLotRepository).shouldHaveNoInteractions();
    }

    private ParkingLot createParkingLot() {
        ParkingLot parkingLot = mock(ParkingLot.class);
        given(parkingLot.getId()).willReturn(PARKING_LOT_ID);
        given(parkingLot.getName()).willReturn("강남 공영주차장");
        given(parkingLot.getLatitude()).willReturn(37.5);
        given(parkingLot.getLongitude()).willReturn(127.0);
        return parkingLot;
    }
}
