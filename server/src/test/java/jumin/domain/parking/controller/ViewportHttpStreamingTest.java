package jumin.domain.parking.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.stream.LongStream;
import jumin.domain.parking.dto.ParkingLotViewportResponse;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
import jumin.domain.parking.service.ParkingSearchService;
import jumin.domain.parking.service.ViewportSearchService;
import jumin.global.exception.ErrorCode;
import jumin.global.exception.GlobalExceptionHandler;
import org.apache.catalina.startup.Tomcat;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.tomcat.servlet.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.servlet.ServletWebServerFactory;
import org.springframework.boot.web.server.servlet.context.AnnotationConfigServletWebServerApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.DispatcherServlet;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
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
        context.register(Web.class, ParkingSearchController.class, GlobalExceptionHandler.class);
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
        // given
        long firstId = 9_007_199_254_740_993L;
        List<ParkingLotViewportResponse> rows = LongStream.range(0, 100)
                .mapToObj(index -> new ParkingLotViewportResponse(firstId + index, 37.5, 127, 0.5)).toList();
        when(service.search(any(), isNull())).thenReturn(ParkingLotViewportResponses.from(rows));

        // when
        try (HttpClient client = HttpClient.newHttpClient()) {
            HttpResponse<byte[]> response = client.send(HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(5)).build(),
                    HttpResponse.BodyHandlers.ofByteArray());

            // then
            assertThat(response.statusCode()).isEqualTo(200);
            var json = new ObjectMapper().readTree(response.body());
            assertThat(json.get("totalCount").asInt()).isEqualTo(100);
            assertThat(json.get("parkingLots").size()).isEqualTo(100);
            assertThat(json.get("parkingLots").get(0).get("id").asLong()).isEqualTo(firstId);
            assertThat(json.get("parkingLots").get(99).get("id").asLong()).isEqualTo(firstId + 99);
            response.headers().firstValueAsLong("Content-Length").ifPresent(size -> assertThat(size).isEqualTo(response.body().length));
        }
    }

    @Test
    @DisplayName("실제 HTTP에서 직렬화에 실패해도 완전한 500 JSON과 올바른 길이를 응답한다")
    void returns_error_response_on_serialization_failure() throws Exception {
        // given
        ParkingLotViewportResponses broken = mock(ParkingLotViewportResponses.class);
        when(broken.totalCount()).thenThrow(new IllegalStateException("injected serialization failure"));
        when(broken.parkingLots()).thenThrow(new IllegalStateException("injected serialization failure"));
        when(service.search(any(), isNull())).thenReturn(broken);

        // when
        try (HttpClient client = HttpClient.newHttpClient()) {
            HttpResponse<byte[]> response = client.send(HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(5)).build(),
                    HttpResponse.BodyHandlers.ofByteArray());

            // then
            assertThat(response.statusCode()).isEqualTo(500);
            assertThat(new ObjectMapper().readTree(response.body()).get("message").asString())
                    .isEqualTo(ErrorCode.INTERNAL_SERVER_ERROR.getMessage());
            response.headers().firstValueAsLong("Content-Length").ifPresent(size -> assertThat(size).isEqualTo(response.body().length));
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
