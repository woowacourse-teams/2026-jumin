package jumin.domain.parkingavailability.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.anything;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import jumin.config.AvailabilityProperties;
import jumin.config.AvailabilityProviderProperties;
import jumin.domain.parkingavailability.dto.AvailabilityObservation;
import jumin.domain.parkingavailability.entity.AvailabilityProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

class SeoulAvailabilityClientTest {

    private static final String BASE_URL = "http://seoul.test:8088";
    private static final String KEY = "private-test-key";
    private static final Instant FETCHED_AT = Instant.parse("2026-10-23T09:15:00Z");
    private MockRestServiceServer server;
    private SeoulAvailabilityClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);
        server = MockRestServiceServer.bindTo(builder).build();
        client = new SeoulAvailabilityClient(
                builder.build(),
                properties(),
                new ObjectMapper(),
                Clock.fixed(FETCHED_AT, ZoneOffset.UTC)
        );
    }

    @Test
    @DisplayName("서울 정식 API에서 총 면수와 주차대수의 차이로 여석을 구하고 원천 KST 시각을 보존한다")
    void fetches_current_availability_from_authenticated_api() {
        // given
        server.expect(requestTo(BASE_URL + "/" + KEY + "/json/GetParkingInfo/1/1000/"))
                .andRespond(withSuccess(payload(1, row("171721", "1", "1260.0", "1260", "2026-10-23 18:14:43")),
                        MediaType.APPLICATION_JSON));

        // when
        AvailabilityObservation result = client.fetch().getFirst();

        // then
        assertThat(result.provider()).isEqualTo(AvailabilityProvider.SEOUL);
        assertThat(result.externalId()).isEqualTo("171721");
        assertThat(result.name()).isEqualTo("세종로 공영주차장");
        assertThat(result.address()).isEqualTo("종로구 세종로 80-1");
        assertThat(result.capacity()).isEqualTo(1260);
        assertThat(result.occupied()).isEqualTo(1260);
        assertThat(result.available()).isZero();
        assertThat(result.sourceUpdatedAt()).isEqualTo(Instant.parse("2026-10-23T09:14:43Z"));
        assertThat(result.fetchedAt()).isEqualTo(FETCHED_AT);

        server.verify();
    }

    @Test
    @DisplayName("서울 전체 데이터가 1000건을 넘으면 다음 페이지까지 완전히 수집한다")
    void fetches_all_pages() {
        // given
        String firstPage = IntStream.rangeClosed(1, 1000)
                .mapToObj(i -> row(Integer.toString(i), "1", "10", "2", "2026-10-23 18:14:43"))
                .collect(Collectors.joining(","));
        server.expect(requestTo(BASE_URL + "/" + KEY + "/json/GetParkingInfo/1/1000/"))
                .andRespond(withSuccess(payload(1001, firstPage), MediaType.APPLICATION_JSON));
        server.expect(requestTo(BASE_URL + "/" + KEY + "/json/GetParkingInfo/1001/2000/"))
                .andRespond(withSuccess(payload(1001,
                        row("1001", "1", "10", "2", "2026-10-23 18:14:43")), MediaType.APPLICATION_JSON));

        // when
        List<AvailabilityObservation> results = client.fetch();

        // then
        assertThat(results).hasSize(1001);
        assertThat(results.getLast().externalId()).isEqualTo("1001");
        server.verify();
    }

    @Test
    @DisplayName("서울 미연계·결측·범위 오류·잘못된 시각을 실제 여석 0으로 바꾸지 않는다")
    void preserves_unsupported_and_invalid_source_values() {
        // given
        String rows = String.join(",",
                row("unsupported", "0", "10", "2", "2026-10-23 18:14:43"),
                row("missing", "1", "10", "null", "2026-10-23 18:14:43"),
                row("range", "1", "10", "11", "2026-10-23 18:14:43"),
                row("fraction", "1", "10", "2.5", "2026-10-23 18:14:43"),
                row("bad-time", "1", "10", "2", "2026-02-30 18:14:43"),
                row("future", "1", "10", "2", "2026-10-23 18:17:01"),
                row("unknown-status", "", "10", "2", "2026-10-23 18:14:43"));
        server.expect(anything()).andRespond(withSuccess(payload(7, rows), MediaType.APPLICATION_JSON));

        // when
        List<AvailabilityObservation> results = client.fetch();

        // then
        assertThat(results).hasSize(7);
        assertThat(results.getFirst().available()).isNull();
        assertThat(results.getLast().available()).isNull();
        assertThat(results.get(1).available()).isNull();
        assertThat(results.get(2).available()).isEqualTo(-1);
        assertThat(results.get(4).sourceUpdatedAt()).isNull();
        server.verify();
    }

    @Test
    @DisplayName("서울 미지원·알 수 없는 상태는 여석을 비우고 미래·결측 원천 시각을 보존한다")
    void preserves_source_times_without_inventing_available_counts() {
        // given
        String rows = String.join(",",
                row("unsupported-future", "0", "10", "2", "2099-01-01 00:00:00"),
                row("unknown-future", "9", "10", "2", "2099-01-01 00:00:00"),
                row("unsupported-missing-time", "0", "10", "2", ""),
                row("invalid-numeric-future", "1", "10", "11", "2099-01-01 00:00:00"));
        server.expect(anything()).andRespond(withSuccess(payload(4, rows), MediaType.APPLICATION_JSON));

        // when
        List<AvailabilityObservation> results = client.fetch();

        // then
        assertThat(results).hasSize(4);
        assertThat(results.getFirst().available()).isNull();
        assertThat(results.get(1).available()).isNull();
        assertThat(results.get(2).sourceUpdatedAt()).isNull();
        assertThat(results.get(3).sourceUpdatedAt()).isAfter(Instant.parse("2098-01-01T00:00:00Z"));
        server.verify();
    }

    @Test
    @DisplayName("서울 응답이 HTTP 200이어도 제공기관 오류이면 키와 본문이 없는 예외로 처리한다")
    void rejects_business_error_without_exposing_credentials() {
        // given
        server.expect(anything()).andRespond(withSuccess("""
                {"RESULT":{"CODE":"ERROR-300","MESSAGE":"private-test-key"}}
                """, MediaType.APPLICATION_JSON));

        // when & then
        assertThatThrownBy(() -> client.fetch()).isInstanceOf(IllegalStateException.class)
                .hasMessage("서울 실시간 여석 수집에 실패했습니다. 제공기관이 오류를 반환했습니다.")
                .hasNoCause();
        server.verify();
    }

    @Test
    @DisplayName("서울 HTTP 오류의 URL·응답·원인 예외가 로그 가능한 수집 예외에 포함되지 않는다")
    void sanitizes_transport_errors() {
        // given
        server.expect(anything()).andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR)
                .body("error request key=" + KEY));

        // when & then
        assertThatThrownBy(() -> client.fetch()).isInstanceOf(IllegalStateException.class)
                .hasMessage("서울 실시간 여석 수집에 실패했습니다. 외부 API 요청에 실패했습니다.")
                .hasNoCause();
        server.verify();
    }

    @Test
    @DisplayName("서울 중복 코드가 있으면 부분 수집 결과를 반환하지 않는다")
    void rejects_duplicate_provider_ids() {
        // given
        String repeated = row("same", "1", "10", "2", "2026-10-23 18:14:43");
        server.expect(anything()).andRespond(withSuccess(payload(2, repeated + "," + repeated),
                MediaType.APPLICATION_JSON));

        // when & then
        assertThatThrownBy(() -> client.fetch()).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("외부 주차장 코드가 없거나 중복되었습니다.");
        server.verify();
    }

    @Test
    @DisplayName("서울 페이지 총 건수가 수집 도중 변하면 부분 스냅샷을 폐기한다")
    void rejects_changed_total_during_paging() {
        // given
        String firstPage = IntStream.rangeClosed(1, 1000)
                .mapToObj(i -> row(Integer.toString(i), "1", "10", "2", "2026-10-23 18:14:43"))
                .collect(Collectors.joining(","));
        server.expect(anything()).andRespond(withSuccess(payload(1001, firstPage), MediaType.APPLICATION_JSON));
        server.expect(anything()).andRespond(withSuccess(payload(1002,
                row("1001", "1", "10", "2", "2026-10-23 18:14:43")), MediaType.APPLICATION_JSON));

        // when & then
        assertThatThrownBy(() -> client.fetch()).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("전체 건수나 페이지 크기가 올바르지 않거나 수집 중 전체 건수가 변경되었습니다.");
        server.verify();
    }

    @Test
    @DisplayName("서울 JSON이 잘못되면 원문을 예외에 포함하지 않는다")
    void rejects_malformed_json_without_exposing_response() {
        // given
        server.expect(anything()).andRespond(withSuccess("<error>" + KEY + "</error>",
                MediaType.APPLICATION_XML));

        // when & then
        assertThatThrownBy(() -> client.fetch()).isInstanceOf(IllegalStateException.class)
                .hasMessage("서울 실시간 여석 수집에 실패했습니다. API 응답을 JSON으로 해석할 수 없습니다.")
                .hasNoCause();
        server.verify();
    }

    private AvailabilityProperties properties() {
        return new AvailabilityProperties(false,
                new AvailabilityProviderProperties(BASE_URL, KEY), new AvailabilityProviderProperties("https://busan.test", "busan-key"));
    }

    private String payload(int total, String rows) {
        return """
                {"GetParkingInfo":{"list_total_count":%d,"RESULT":{"CODE":"INFO-000"},"row":[%s]}}
                """.formatted(total, rows);
    }

    private String row(String id, String status, String capacity, String occupied, String updatedAt) {
        return """
                {"PKLT_CD":"%s","PKLT_NM":"세종로 공영주차장","ADDR":"종로구 세종로 80-1",
                 "PRK_STTS_YN":"%s","TPKCT":%s,"NOW_PRK_VHCL_CNT":%s,"NOW_PRK_VHCL_UPDT_TM":"%s"}
                """.formatted(id, status, capacity, occupied, updatedAt);
    }
}
