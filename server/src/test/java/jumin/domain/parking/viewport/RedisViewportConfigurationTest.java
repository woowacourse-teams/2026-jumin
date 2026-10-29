package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import jumin.config.ViewportCacheProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

class RedisViewportConfigurationTest {

    @TempDir
    Path temporary;

    @Test
    @DisplayName("Spring configtree의 분리된 Redis 자격증명과 PEM 경로를 바인딩한다")
    void binds_separate_credentials_from_configtree() throws Exception {
        Files.writeString(temporary.resolve("jumin.viewport.cache.redis-username"), "viewport");
        Files.writeString(temporary.resolve("jumin.viewport.cache.redis-password"), "only-for-test");
        Files.writeString(temporary.resolve("jumin.viewport.cache.redis-tls-ca-file"), "/run/test/redis.crt");

        try (var context = new SpringApplicationBuilder(BindingConfiguration.class)
                .web(WebApplicationType.NONE)
                .properties("spring.config.import=configtree:" + temporary.toAbsolutePath() + "/",
                        "spring.main.banner-mode=off")
                .run()) {
            ViewportCacheProperties properties = context.getBean(ViewportCacheProperties.class);
            assertThat(properties.getRedisUsername()).isEqualTo("viewport");
            assertThat(properties.getRedisPassword()).isEqualTo("only-for-test");
            assertThat(properties.getRedisTlsCaFile()).isEqualTo("/run/test/redis.crt");
        }
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
                // A valid configuration would close its client and resources here.
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
