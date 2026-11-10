package jumin.config;

import static jumin.config.ViewportCacheProperties.MAX_CELL_ROWS;
import static jumin.config.ViewportCacheProperties.MAX_VALUE_BYTES;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import jumin.domain.parking.cache.RedisViewportCellStore;
import jumin.domain.parking.cache.ViewportCellCodec;
import jumin.domain.parking.monitoring.ViewportMetrics;
import jumin.domain.parking.service.ViewportCellCover;
import jumin.domain.parking.service.ViewportSquareGrid;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.SystemEnvironmentPropertySource;

class RedisViewportConfigurationTest {

    @TempDir
    Path temporary;

    @Test
    @DisplayName("환경변수의 Redis 연결 설정을 바인딩한다")
    void binds_deployment_environment_variables() {
        // given
        Map<String, Object> variables = Map.of(
                "JUMIN_VIEWPORT_CACHE_REDISURI", "rediss://redis.test:6379",
                "JUMIN_VIEWPORT_CACHE_REDISUSERNAME", "viewport",
                "JUMIN_VIEWPORT_CACHE_REDISPASSWORD", "only-for-test",
                "JUMIN_VIEWPORT_CACHE_REDISTLSCAFILE", "/app/redis-ca.pem");

        // when & then
        new ApplicationContextRunner()
                .withUserConfiguration(BindingConfiguration.class)
                .withInitializer(context -> context.getEnvironment().getPropertySources()
                        .addFirst(new SystemEnvironmentPropertySource("systemEnvironment", variables)))
                .run(context -> {
                    ViewportCacheProperties properties = context.getBean(ViewportCacheProperties.class);
                    assertThat(properties.getRedisUri()).isEqualTo("rediss://redis.test:6379");
                    assertThat(properties.getRedisUsername()).isEqualTo("viewport");
                    assertThat(properties.getRedisPassword()).isEqualTo("only-for-test");
                    assertThat(properties.getRedisTlsCaFile()).isEqualTo("/app/redis-ca.pem");
                });
    }

    @Test
    @DisplayName("URI에 넣은 비밀과 잘못된 URI를 거절하고 예외에서 값을 숨긴다")
    void rejects_uri_credentials_without_exposing_them() {
        // given
        String secret = "uri-secret-never-log";
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setRedisUri("rediss://viewport:" + secret + "@127.0.0.1:6379");

        // when & then
        assertRejectedWithoutSecret(properties, secret);
        properties.setRedisUri("rediss://viewport:" + secret + "@[invalid");
        assertRejectedWithoutSecret(properties, secret);
    }

    @Test
    @DisplayName("부분 자격증명, 검증 해제, 평문 연결의 PEM과 잘못된 PEM을 거절한다")
    void rejects_incomplete_credentials_and_unsafe_tls() throws Exception {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setRedisUsername("viewport");

        // when & then
        assertRejectedWithoutSecret(properties, "unrelated-test-secret");

        properties.setRedisPassword("test-password");
        properties.setRedisUri("rediss://127.0.0.1:6379?verifyPeer=false");
        assertRejectedWithoutSecret(properties, "test-password");

        properties.setRedisUri("redis://127.0.0.1:6379");
        properties.setRedisTlsCaFile(temporary.resolve("ca.pem").toString());
        assertRejectedWithoutSecret(properties, "test-password");

        properties.setRedisUri("rediss://127.0.0.1:6379");
        Files.writeString(temporary.resolve("ca.pem"), "not a certificate");
        assertRejectedWithoutSecret(properties, "test-password");
    }

    private static void assertRejectedWithoutSecret(ViewportCacheProperties properties, String secret) {
        Throwable failure = catchThrowable(() -> {
            try (RedisViewportCellStore ignored = store(properties)) {
            }
        });
        assertThat(failure).isInstanceOf(IllegalArgumentException.class);
        StringWriter trace = new StringWriter();
        failure.printStackTrace(new PrintWriter(trace));
        assertThat(trace.toString()).doesNotContain(secret);
    }

    private static RedisViewportCellStore store(ViewportCacheProperties properties) {
        return new RedisViewportCellStore(properties,
                new ViewportCellCodec(MAX_VALUE_BYTES, MAX_CELL_ROWS),
                new ViewportCellCover(new ViewportSquareGrid()),
                new ViewportMetrics(new SimpleMeterRegistry()));
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(ViewportCacheProperties.class)
    static class BindingConfiguration { }
}
