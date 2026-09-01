package jumin.domain.destination.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.anything;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import jumin.config.ReverseGeocodingProperties;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

@ExtendWith(OutputCaptureExtension.class)
class ReverseGeocodingClientTest {

    private static final String BASE_URL = "https://maps.apigw.ntruss.com";
    private static final String CLIENT_ID = "client-id";
    private static final String CLIENT_SECRET = "client-secret";

    private MockRestServiceServer server;
    private ReverseGeocodingClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);
        server = MockRestServiceServer.bindTo(builder).build();
        client = new ReverseGeocodingClient(
                builder.build(),
                new ObjectMapper(),
                new ReverseGeocodingProperties(BASE_URL, CLIENT_ID, CLIENT_SECRET)
        );
    }

    @Test
    @DisplayName("네이버 역지오코딩 요청에 경도,위도 순서의 좌표와 인증 헤더를 전달한다")
    void sends_reverse_geocoding_request_and_maps_building_name() {
        // given
        server.expect(request -> {
                    assertThat(request.getURI().getPath()).isEqualTo("/map-reversegeocode/v2/gc");
                    assertThat(request.getURI().getQuery()).contains("coords=126.978,37.5665");
                    assertThat(request.getURI().getQuery()).contains("sourcecrs=EPSG:4326");
                    assertThat(request.getURI().getQuery()).contains("orders=roadaddr,addr,admcode");
                    assertThat(request.getURI().getQuery()).contains("output=json");
                    assertThat(request.getHeaders().getFirst("X-NCP-APIGW-API-KEY-ID")).isEqualTo(CLIENT_ID);
                    assertThat(request.getHeaders().getFirst("X-NCP-APIGW-API-KEY")).isEqualTo(CLIENT_SECRET);
                })
                .andRespond(withSuccess("""
                        {
                          "status": {"code": 0, "name": "ok", "message": "done"},
                          "results": [{
                            "name": "roadaddr",
                            "region": {
                              "area1": {"name": "서울특별시"},
                              "area2": {"name": "중구"},
                              "area3": {"name": "태평로1가"}
                            },
                            "land": {
                              "name": "세종대로",
                              "number1": "110",
                              "number2": "",
                              "addition0": {"type": "building", "value": "서울특별시청"}
                            }
                          }]
                        }
                        """, MediaType.APPLICATION_JSON));

        // when
        ReverseGeocodingResult response = client.reverseGeocode(37.5665, 126.9780);

        // then
        assertThat(response.buildingName()).isEqualTo("서울특별시청");
        assertThat(response.roadAddress()).isEqualTo("서울특별시 중구 세종대로 110");
        server.verify();
    }

    @Test
    @DisplayName("도로명 주소에 읍·면은 포함하고 동은 포함하지 않는다")
    void includes_eup_or_myeon_but_excludes_dong_in_road_address() {
        // given
        server.expect(anything())
                .andRespond(withSuccess("""
                        {
                          "status": {"code": 0},
                          "results": [{
                            "name": "roadaddr",
                            "region": {
                              "area1": {"name": "전라남도"},
                              "area2": {"name": "광양시"},
                              "area3": {"name": "광양읍"}
                            },
                            "land": {
                              "name": "매일시장길",
                              "number1": "20",
                              "number2": ""
                            }
                          }]
                        }
                        """, MediaType.APPLICATION_JSON));

        // when
        ReverseGeocodingResult response = client.reverseGeocode(34.9765, 127.585);

        // then
        assertThat(response.roadAddress()).isEqualTo("전라남도 광양시 광양읍 매일시장길 20");
        server.verify();
    }

    @Test
    @DisplayName("도로명 주소가 없으면 지번 주소와 행정동 주소를 매핑한다")
    void maps_lot_and_administrative_addresses_when_road_address_is_missing() {
        // given
        server.expect(anything())
                .andRespond(withSuccess("""
                        {
                          "status": {"code": 0},
                          "results": [
                            {
                              "name": "addr",
                              "region": {
                                "area1": {"name": "전라남도"},
                                "area2": {"name": "광양시"},
                                "area3": {"name": "광양읍"},
                                "area4": {"name": "읍내리"}
                              },
                              "land": {
                                "type": "1",
                                "number1": "252",
                                "number2": "1"
                              }
                            },
                            {
                              "name": "admcode",
                              "region": {
                                "area1": {"name": "전라남도"},
                                "area2": {"name": "광양시"},
                                "area3": {"name": "광양읍"}
                              }
                            }
                          ]
                        }
                        """, MediaType.APPLICATION_JSON));

        // when
        ReverseGeocodingResult response = client.reverseGeocode(34.9765, 127.585);

        // then
        assertThat(response.buildingName()).isBlank();
        assertThat(response.roadAddress()).isBlank();
        assertThat(response.lotAddress()).isEqualTo("전라남도 광양시 광양읍 읍내리 252-1");
        assertThat(response.administrativeAddress()).isEqualTo("전라남도 광양시 광양읍");
        server.verify();
    }

    @Test
    @DisplayName("네이버 역지오코딩 API가 요청 한도를 초과하면 429 비즈니스 오류로 변환한다")
    void maps_rate_limit_to_business_exception() {
        // given
        server.expect(anything())
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));

        // when & then
        assertThatThrownBy(() -> client.reverseGeocode(37.5665, 126.9780))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.DESTINATION_REVERSE_GEOCODING_RATE_LIMITED)
                );
        server.verify();
    }

    @Test
    @DisplayName("네이버 역지오코딩 API의 서버 오류를 502 비즈니스 오류로 변환한다")
    void maps_upstream_error_to_business_exception() {
        // given
        server.expect(anything())
                .andRespond(withStatus(HttpStatus.BAD_GATEWAY));

        // when & then
        assertThatThrownBy(() -> client.reverseGeocode(37.5665, 126.9780))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.DESTINATION_REVERSE_GEOCODING_CLIENT_FAILED)
                );
    }

    @Test
    @DisplayName("네이버 역지오코딩 API의 비정상 JSON 응답을 502 비즈니스 오류로 변환한다")
    void maps_malformed_response_to_business_exception(CapturedOutput output) {
        // given
        server.expect(anything())
                .andRespond(withSuccess("null", MediaType.APPLICATION_JSON));

        // when & then
        assertThatThrownBy(() -> client.reverseGeocode(37.5665, 126.9780))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.DESTINATION_REVERSE_GEOCODING_CLIENT_FAILED)
                );
        assertThat(output)
                .contains("failureType=\"invalid_response\"")
                .contains("responseType=\"NULL\"");
    }

    @Test
    @DisplayName("네이버 역지오코딩 API가 실패 상태를 반환하면 상태 정보를 로그로 남기고 502로 변환한다")
    void maps_provider_error_status_to_business_exception_and_logs_details(CapturedOutput output) {
        // given
        server.expect(anything())
                .andRespond(withSuccess("""
                        {
                          "status": {
                            "code": 1,
                            "name": "invalid request",
                            "message": "invalid coordinate"
                          },
                          "results": []
                        }
                        """, MediaType.APPLICATION_JSON));

        // when & then
        assertThatThrownBy(() -> client.reverseGeocode(37.5665, 126.9780))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.DESTINATION_REVERSE_GEOCODING_CLIENT_FAILED)
                );
        assertThat(output)
                .contains("failureType=\"provider_error\"")
                .contains("statusCode=\"1\"")
                .contains("statusName=\"invalid request\"")
                .contains("statusMessage=\"invalid coordinate\"");
        server.verify();
    }

    @Test
    @DisplayName("네이버 역지오코딩 API가 결과를 반환하지 않으면 빈 결과로 변환한다")
    void maps_no_results_to_empty_result() {
        // given
        server.expect(anything())
                .andRespond(withSuccess("""
                        {
                          "status": {"code": 3, "name": "no results", "message": "no results"},
                          "results": []
                        }
                        """, MediaType.APPLICATION_JSON));

        // when
        ReverseGeocodingResult response = client.reverseGeocode(37.5665, 126.9780);

        // then
        assertThat(response.buildingName()).isBlank();
        assertThat(response.roadAddress()).isBlank();
        server.verify();
    }
}
