package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;
import jumin.config.ViewportCacheProperties;
import jumin.config.ViewportResponseCleanup;
import jumin.domain.parking.controller.ParkingSearchController;
import jumin.domain.parking.service.ParkingLodScoreCalculator;
import jumin.domain.parking.service.ParkingSearchService;
import jumin.global.exception.ErrorCode;
import jumin.global.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.tomcat.servlet.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.servlet.ServletWebServerFactory;
import org.springframework.boot.web.server.servlet.context.AnnotationConfigServletWebServerApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.InputStreamResource;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.servlet.DispatcherServlet;
import org.apache.catalina.startup.Tomcat;
import tools.jackson.databind.ObjectMapper;

class ViewportHttpStreamingTest {

    private static AnnotationConfigServletWebServerApplicationContext context;
    private static ViewportSearchService service;
    private static URI endpoint;
    @TempDir Path root;

    @BeforeAll
    static void startServer() {
        service = mock(ViewportSearchService.class);
        context = new AnnotationConfigServletWebServerApplicationContext();
        context.registerBean(ParkingSearchService.class, () -> mock(ParkingSearchService.class));
        context.registerBean(ViewportSearchService.class, () -> service);
        context.register(Web.class, ParkingSearchController.class, GlobalExceptionHandler.class, ViewportResponseCleanup.class);
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
    @DisplayName("실제 HTTP에서 준비 후 unlink된 spool도 전체 JSON과 일치하는 framing으로 응답한다")
    void serves_open_file_handle_over_http() throws Exception {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxRequestBytes(320);
        try (ViewportSpool spool = new ViewportSpool(properties, new ParkingLodScoreCalculator(), root);
             ViewportSpool.Builder builder = spool.builder(); HttpClient client = HttpClient.newHttpClient()) {
            for (int index = 0; index < 100; index++) {
                builder.add(new ViewportItem(index, 37.5, 127, 50, false, true, false, false, false));
            }
            ViewportBody body = builder.build();
            AtomicReference<Boolean> completed = new AtomicReference<>();
            when(service.search(any())).thenReturn(body.onCompletion(completed::set));
            try (var files = Files.walk(root)) {
                Files.delete(files.filter(path -> path.toString().endsWith(".json")).findFirst().orElseThrow());
            }

            // when
            HttpResponse<byte[]> response = client.send(HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(5)).build(),
                    HttpResponse.BodyHandlers.ofByteArray());

            // then
            assertThat(response.statusCode()).isEqualTo(200);
            var json = new ObjectMapper().readTree(response.body());
            assertThat(json.get("totalCount").asInt()).isEqualTo(100);
            assertThat(json.get("parkingLots").size()).isEqualTo(100);
            response.headers().firstValueAsLong("Content-Length").ifPresent(size -> assertThat(size).isEqualTo(response.body().length));
            assertThat(completed.get()).isTrue();
            assertThat(spool.reservedBytes()).isZero();
        }
    }

    @Test
    @DisplayName("실제 HTTP에서 single-use stream open이 실패해도 완전한 500 JSON과 올바른 길이를 응답한다")
    void does_not_retain_success_length_on_stream_open_failure() throws Exception {
        // given
        AtomicReference<Boolean> completed = new AtomicReference<>();
        InputStreamResource broken = new InputStreamResource(() -> { throw new IOException("innocuous injected failure"); });
        when(service.search(any())).thenReturn(new ViewportBody(broken, () -> { }).onCompletion(completed::set));

        // when
        try (HttpClient client = HttpClient.newHttpClient()) {
            HttpResponse<byte[]> response = client.send(HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(5)).build(),
                    HttpResponse.BodyHandlers.ofByteArray());

            // then
            assertThat(response.statusCode()).isEqualTo(500);
            assertThat(new ObjectMapper().readTree(response.body()).get("message").asText())
                    .isEqualTo(ErrorCode.INTERNAL_SERVER_ERROR.getMessage());
            response.headers().firstValueAsLong("Content-Length").ifPresent(size -> assertThat(size).isEqualTo(response.body().length));
            assertThat(completed.get()).isFalse();
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
