package jumin.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import io.micrometer.observation.Observation.Context;
import io.micrometer.observation.ObservationHandler;
import io.micrometer.observation.ObservationRegistry;
import java.util.concurrent.atomic.AtomicInteger;
import jumin.config.AvailabilityProperties.Provider;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class AvailabilityConfigTest {

    @Test
    @DisplayName("인증키가 URI에 포함되는 수집 클라이언트는 HTTP 관측에 URI를 전달하지 않는다")
    void disables_http_observations_for_authenticated_urls() {
        // given
        AtomicInteger observations = new AtomicInteger();
        ObservationRegistry registry = ObservationRegistry.create();
        registry.observationConfig().observationHandler(new ObservationHandler<>() {
            @Override
            public void onStart(Context context) {
                observations.incrementAndGet();
            }

            @Override
            public boolean supportsContext(Context context) {
                return true;
            }
        });
        RestClient.Builder builder = RestClient.builder().observationRegistry(registry);
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://seoul.test/seoul-key/json/GetParkingInfo/1/1000"))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://busan.test/getParkingInfoList_v2?serviceKey=busan-key"))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        AvailabilityProperties properties = new AvailabilityProperties(false,
                new Provider("http://seoul.test", "seoul-key"), new Provider("https://busan.test", "busan-key"));
        AvailabilityConfig config = new AvailabilityConfig();

        // when
        config.seoulAvailabilityRestClient(builder, properties).get()
                .uri("/seoul-key/json/GetParkingInfo/1/1000").retrieve().body(String.class);
        config.busanAvailabilityRestClient(builder, properties).get()
                .uri("/getParkingInfoList_v2?serviceKey=busan-key").retrieve().body(String.class);

        // then
        assertThat(observations).hasValue(0);
        server.verify();
    }
}
