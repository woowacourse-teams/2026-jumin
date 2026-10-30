package jumin.domain.parkingavailability.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.anything;
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
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

class BusanAvailabilityClientTest {

    private static final String BASE_URL = "https://busan.test/B552587/ParkingInfoService_v2";
    private static final String KEY = "test+key/value=";
    private static final Instant FETCHED_AT = Instant.parse("2026-10-23T09:15:00Z");
    private MockRestServiceServer server;
    private BusanAvailabilityClient client;

    @BeforeEach
    void setUp() {
        createClient(KEY);
    }

    @Test
    @DisplayName("부산 여석 API만 호출하고 인증키 특수문자를 정확히 인코딩한다")
    void fetches_live_values_and_encodes_decoded_key() {
        // given
        server.expect(request -> {
            assertThat(request.getURI().getPath()).isEqualTo("/B552587/ParkingInfoService_v2/getParkingInfoList_v2");
            assertThat(request.getURI().getRawQuery()).contains(
                    "pageNo=1",
                    "numOfRows=1000",
                    "resultType=json",
                    "serviceKey=test%2Bkey%2Fvalue%3D"
            );
        }).andRespond(withSuccess(payload(1, row("A01", "152", "98", "54", "2026-10-23 18:15:00")),
                MediaType.APPLICATION_JSON));

        // when
        AvailabilityObservation result = client.fetch().getFirst();

        // then
        assertThat(result.provider()).isEqualTo(AvailabilityProvider.BUSAN);
        assertThat(result.externalId()).isEqualTo("A01");
        assertThat(result.capacity()).isEqualTo(152);
        assertThat(result.occupied()).isEqualTo(98);
        assertThat(result.available()).isEqualTo(54);
        assertThat(result.sourceUpdatedAt()).isEqualTo(FETCHED_AT);

        server.verify();
    }

    @Test
    @DisplayName("공공데이터포털의 인코딩 인증키도 중복 인코딩하지 않는다")
    void accepts_portal_encoded_key() {
        // given
        createClient("test%2Bkey%2Fvalue%3D");
        server.expect(request -> assertThat(request.getURI().getRawQuery())
                        .contains("serviceKey=test%2Bkey%2Fvalue%3D").doesNotContain("%25"))
                .andRespond(withSuccess(payload(1,
                        row("A01", "10", "10", "0", "2026-10-23 18:15:00")), MediaType.APPLICATION_JSON));

        // when
        AvailabilityObservation result = client.fetch().getFirst();

        // then
        assertThat(result.available()).isZero();

        server.verify();
    }

    @Test
    @DisplayName("부산 전체 건수가 1000건을 넘으면 다음 페이지를 조회한다")
    void fetches_all_pages() {
        // given
        String firstPage = IntStream.rangeClosed(1, 1000)
                .mapToObj(i -> row("A" + i, "10", "2", "8", "2026-10-23 18:15:00"))
                .collect(Collectors.joining(","));
        server.expect(request -> assertThat(request.getURI().getRawQuery()).contains("pageNo=1"))
                .andRespond(withSuccess(payload(1001, firstPage), MediaType.APPLICATION_JSON));
        server.expect(request -> assertThat(request.getURI().getRawQuery()).contains("pageNo=2"))
                .andRespond(withSuccess(payload(1001,
                        row("A1001", "10", "2", "8", "2026-10-23 18:15:00")), MediaType.APPLICATION_JSON));

        // when
        List<AvailabilityObservation> results = client.fetch();

        // then
        assertThat(results).hasSize(1001);
        assertThat(results.getLast().externalId()).isEqualTo("A1001");
        server.verify();
    }

    @Test
    @DisplayName("부산 음수·결측·대수 불일치와 잘못된 갱신시각을 원천값으로 보존한다")
    void preserves_invalid_numeric_and_time_observations() {
        // given
        String rows = String.join(",",
                row("negative", "10", "11", "-1", "2026-10-23 18:15:00"),
                row("missing", "10", "2", "null", "2026-10-23 18:15:00"),
                row("inconsistent", "10", "2", "7", "2026-10-23 18:15:00"),
                row("missing-time", "10", "2", "8", ""),
                row("invalid-date", "10", "2", "8", "2026-13-01 18:15:00"),
                row("future", "10", "2", "8", "2026-10-23 18:17:01"),
                row("compact-time", "10", "2", "8", "20261023181500"));
        server.expect(anything()).andRespond(withSuccess(payload(7, rows), MediaType.APPLICATION_JSON));

        // when
        List<AvailabilityObservation> results = client.fetch();

        // then
        assertThat(results).hasSize(7);
        assertThat(results.get(2).available()).isEqualTo(7);
        assertThat(results.get(2).occupied()).isEqualTo(2);
        assertThat(results.getFirst().available()).isEqualTo(-1);
        assertThat(results.get(1).available()).isNull();
        assertThat(results.get(3).sourceUpdatedAt()).isNull();
        server.verify();
    }

    @Test
    @DisplayName("부산 HTTP 200 인증 실패를 정상적인 빈 결과로 처리하지 않는다")
    void rejects_business_error_and_discards_provider_message() {
        // given
        server.expect(anything()).andRespond(withSuccess("""
                {"response":{"header":{"resultCode":"30","resultMsg":"test+key/value="}}}
                """, MediaType.APPLICATION_JSON));

        // when & then
        assertThatThrownBy(() -> client.fetch()).isInstanceOf(IllegalStateException.class)
                .hasMessage("부산 실시간 여석 수집에 실패했습니다. 제공기관이 오류를 반환했습니다.").hasNoCause();
        server.verify();
    }

    @Test
    @DisplayName("부산 totalCount보다 적은 데이터와 빈 다음 페이지는 전체 수집 실패로 처리한다")
    void rejects_incomplete_snapshot() {
        // given
        server.expect(anything()).andRespond(withSuccess(payload(2,
                row("A01", "10", "2", "8", "2026-10-23 18:15:00")), MediaType.APPLICATION_JSON));
        server.expect(anything()).andRespond(withSuccess(payload(2, ""), MediaType.APPLICATION_JSON));

        // when & then
        assertThatThrownBy(() -> client.fetch()).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("전체 주차장 데이터를 빠짐없이 수집하지 못했습니다.");
        server.verify();
    }

    @Test
    @DisplayName("부산 단건 item 객체 응답도 전체 수집한다")
    void accepts_single_item_object() {
        // given
        String payload = """
                {"response":{"header":{"resultCode":"00"},"body":{"totalCount":1,"items":{"item":%s}}}}
                """.formatted(row("A01", "10", "2", "8", "2026-10-23 18:15:00"));
        server.expect(anything()).andRespond(withSuccess(payload, MediaType.APPLICATION_JSON));

        // when
        List<AvailabilityObservation> results = client.fetch();

        // then
        assertThat(results).singleElement().extracting(AvailabilityObservation::available).isEqualTo(8);
        server.verify();
    }

    private void createClient(String key) {
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE_URL);
        server = MockRestServiceServer.bindTo(builder).build();
        AvailabilityProperties properties = new AvailabilityProperties(false,
                new AvailabilityProviderProperties("http://seoul.test", "seoul-key"), new AvailabilityProviderProperties(BASE_URL, key));
        client = new BusanAvailabilityClient(builder.build(), properties, new ObjectMapper(),
                Clock.fixed(FETCHED_AT, ZoneOffset.UTC));
    }

    private String payload(int total, String rows) {
        return """
                {"response":{"header":{"resultCode":"00"},
                  "body":{"totalCount":%d,"items":{"item":[%s]}}}}
                """.formatted(total, rows);
    }

    private String row(String id, String capacity, String occupied, String available, String updatedAt) {
        return """
                {"parkgcd":"%s","parknm":"반송1, 3동 공영","maxcnt":%s,"parkingcnt":%s,
                 "curravacnt":%s,"lastupdatetime":"%s"}
                """.formatted(id, capacity, occupied, available, updatedAt);
    }
}
