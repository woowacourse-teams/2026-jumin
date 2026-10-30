package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.LongStream;
import jumin.config.ViewportResponseCompletion;
import jumin.domain.parking.controller.ParkingSearchController;
import jumin.domain.parking.dto.ParkingLotViewportResponse;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
import jumin.domain.parking.service.ParkingSearchService;
import jumin.global.exception.ErrorCode;
import jumin.global.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.tomcat.servlet.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.servlet.ServletWebServerFactory;
import org.springframework.boot.web.server.servlet.context.AnnotationConfigServletWebServerApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.servlet.DispatcherServlet;
import org.apache.catalina.startup.Tomcat;
import tools.jackson.databind.ObjectMapper;

class ViewportHttpStreamingTest {

    private static AnnotationConfigServletWebServerApplicationContext context;
    private static ViewportSearchService service;
    private static URI endpoint;

    @BeforeAll
    static void startServer() {
        service = mock(ViewportSearchService.class);
        context = new AnnotationConfigServletWebServerApplicationContext();
        context.registerBean(ParkingSearchService.class, () -> mock(ParkingSearchService.class));
        context.registerBean(ViewportSearchService.class, () -> service);
        context.register(Web.class, ParkingSearchController.class, GlobalExceptionHandler.class, ViewportResponseCompletion.class);
        context.refresh();
        endpoint = URI.create("http://127.0.0.1:" + context.getWebServer().getPort()
                + "/api/parking/viewport?westLongitude=126.99&southLatitude=37.49&eastLongitude=127.01&northLatitude=37.51");
    }

    @AfterAll
    static void stopServer() {
        if (context != null) {
            context.close();
        }
    }

    @Test
    @DisplayName("실제 HTTP에서 모든 항목과 큰 정수 ID를 완전한 JSON으로 응답한다")
    void serves_complete_response_over_http() throws Exception {
        long firstId = 9_007_199_254_740_993L;
        List<ParkingLotViewportResponse> rows = LongStream.range(0, 100)
                .mapToObj(index -> new ParkingLotViewportResponse(firstId + index, 37.5, 127, 0.5)).toList();
        try (HttpClient client = HttpClient.newHttpClient()) {
            ViewportBody body = new ViewportBody(ParkingLotViewportResponses.from(rows));
            AtomicReference<Boolean> completed = new AtomicReference<>();
            CountDownLatch finished = new CountDownLatch(1);
            when(service.search(any())).thenReturn(body.onCompletion(success -> {
                completed.set(success);
                finished.countDown();
            }));

            HttpResponse<byte[]> response = client.send(HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(5)).build(),
                    HttpResponse.BodyHandlers.ofByteArray());

            assertThat(response.statusCode()).isEqualTo(200);
            var json = new ObjectMapper().readTree(response.body());
            assertThat(json.get("totalCount").asInt()).isEqualTo(100);
            assertThat(json.get("parkingLots").size()).isEqualTo(100);
            assertThat(json.get("parkingLots").get(0).get("id").asLong()).isEqualTo(firstId);
            assertThat(json.get("parkingLots").get(99).get("id").asLong()).isEqualTo(firstId + 99);
            response.headers().firstValueAsLong("Content-Length").ifPresent(size -> assertThat(size).isEqualTo(response.body().length));
            assertThat(finished.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(completed.get()).isTrue();
        }
    }

    @Test
    @DisplayName("실제 HTTP에서 직렬화에 실패해도 완전한 500 JSON과 올바른 길이를 응답한다")
    void does_not_record_success_on_serialization_failure() throws Exception {
        AtomicReference<Boolean> completed = new AtomicReference<>();
        CountDownLatch finished = new CountDownLatch(1);
        when(service.search(any())).thenReturn(new ViewportBody(new BrokenResponse()).onCompletion(success -> {
            completed.set(success);
            finished.countDown();
        }));

        try (HttpClient client = HttpClient.newHttpClient()) {
            HttpResponse<byte[]> response = client.send(HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(5)).build(),
                    HttpResponse.BodyHandlers.ofByteArray());

            assertThat(response.statusCode()).isEqualTo(500);
            assertThat(new ObjectMapper().readTree(response.body()).get("message").asText())
                    .isEqualTo(ErrorCode.INTERNAL_SERVER_ERROR.getMessage());
            response.headers().firstValueAsLong("Content-Length").ifPresent(size -> assertThat(size).isEqualTo(response.body().length));
            assertThat(finished.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(completed.get()).isFalse();
        }
    }

    static class BrokenResponse {
        public String getValue() {
            throw new IllegalStateException("injected serialization failure");
        }
    }

    @Configuration(proxyBeanMethods = false)
    @EnableWebMvc
    static class Web {
        @Bean
        ServletWebServerFactory webServerFactory() {
            TomcatServletWebServerFactory factory = new TomcatServletWebServerFactory(0);
            factory.addContextCustomizers(tomcat -> {
                Tomcat.addServlet(tomcat, "dispatcher", new DispatcherServlet(context)).setLoadOnStartup(1);
                tomcat.addServletMappingDecoded("/", "dispatcher");
            });
            return factory;
        }
    }
}
