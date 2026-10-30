package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import jumin.config.ViewportCacheProperties;
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
    @DisplayName("배포 환경변수의 Redis 주소와 자격증명 및 PEM 경로를 바인딩한다")
    void binds_deployment_environment_variables() {
        Map<String, Object> variables = Map.of(
                "JUMIN_VIEWPORT_CACHE_REDISURI", "rediss://redis.test:6379",
                "JUMIN_VIEWPORT_CACHE_REDISUSERNAME", "viewport",
                "JUMIN_VIEWPORT_CACHE_REDISPASSWORD", "only-for-test",
                "JUMIN_VIEWPORT_CACHE_REDISTLSCAFILE", "/app/redis-ca.pem");
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
        String secret = "uri-secret-never-log";
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setRedisUri("rediss://viewport:" + secret + "@127.0.0.1:6379");
        assertRejectedWithoutSecret(properties, secret);
        properties.setRedisUri("rediss://viewport:" + secret + "@[invalid");
        assertRejectedWithoutSecret(properties, secret);
    }

    @Test
    @DisplayName("부분 자격증명, 검증 해제, 평문 연결의 PEM과 잘못된 PEM을 거절한다")
    void rejects_incomplete_credentials_and_unsafe_tls() throws Exception {
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setRedisUsername("viewport");
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
                new ViewportCellCodec(properties.getMaxValueBytes(), properties.getMaxCellRows()),
                new ViewportCellCover(new ViewportSquareGrid(), properties),
                new ViewportMetrics(new SimpleMeterRegistry()));
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(ViewportCacheProperties.class)
    static class BindingConfiguration { }
}
