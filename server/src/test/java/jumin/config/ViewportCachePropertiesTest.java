package jumin.config;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.time.Duration;
import java.util.function.BiConsumer;
import java.util.stream.Stream;
import jumin.domain.parking.model.ViewportBounds;
import jumin.domain.parking.service.ViewportCellCover;
import jumin.domain.parking.service.ViewportSquareGrid;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.bind.validation.BindValidationException;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Configuration;

class ViewportCachePropertiesTest {

    private static final ValidatorFactory VALIDATOR_FACTORY = Validation.buildDefaultValidatorFactory();
    private static final Validator VALIDATOR = VALIDATOR_FACTORY.getValidator();

    @AfterAll
    static void closeValidatorFactory() {
        VALIDATOR_FACTORY.close();
    }

    @Test
    @DisplayName("DB 대기 한도와 동기 Redis 동시성 기본값을 적용한다")
    void separates_default_capacity_settings() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();

        // when
        assertValid(properties);

        // then
        assertThat(properties.getMaxConcurrentDb()).isEqualTo(3);
        assertThat(properties.getMaxConcurrentRedis()).isEqualTo(3);
        assertThat(properties.getMaxConcurrentRequests()).isZero();
    }

    @Test
    @DisplayName("Redis transport 추정치를 기존 전체 예산에 합산하고 별도 상한도 검증한다")
    void validates_combined_and_redis_memory_budgets() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxConcurrentRequests(8);

        // when & then
        assertValid(properties);
        properties.setMaxConcurrentDb(16);
        assertInvalid(properties);
        properties.setMaxConcurrentDb(3);
        properties.setMaxConcurrentRedis(6);
        assertValid(properties);
        properties.setMaxConcurrentRedis(9);
        assertInvalid(properties);

        properties.setMaxConcurrentRequests(0);
        properties.setMaxConcurrentDb(1);
        properties.setMaxConcurrentRedis(8);
        assertValid(properties);
        properties.setMaxConcurrentRedis(9);
        assertInvalid(properties);
    }

    @Test
    @DisplayName("연결 제한시간 미설정 시 기존 cache 설정을 따르고 명시값을 별도로 검증한다")
    void falls_back_to_cache_timeout_for_redis_connect() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();

        // when & then
        assertThat(properties.getRedisConnectTimeout()).isNull();
        assertThat(properties.getEffectiveRedisConnectTimeout()).isEqualTo(Duration.ofMillis(500));
        properties.setCacheTimeout(Duration.ofMillis(80));
        assertThat(properties.getEffectiveRedisConnectTimeout()).isEqualTo(Duration.ofMillis(80));
        properties.setRedisConnectTimeout(Duration.ofMillis(500));
        assertThat(properties.getEffectiveRedisConnectTimeout()).isEqualTo(Duration.ofMillis(500));
        assertThat(properties.getCacheTimeout()).isEqualTo(Duration.ofMillis(80));
        assertValid(properties);
        properties.setRedisConnectTimeout(Duration.ZERO);
        assertInvalid(properties);
        properties.setRedisConnectTimeout(Duration.ofSeconds(3));
        assertInvalid(properties);
    }
    @ParameterizedTest(name = "{0}")
    @MethodSource("integerLimits")
    @DisplayName("고정 처리 예산에서 동시 실행 설정의 경계를 허용하고 초과 시 설정명을 표시한다")
    void preserves_integer_boundaries(String setting, BiConsumer<ViewportCacheProperties, Integer> setter,
                                     int minimum, int maximum) {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxConcurrentDb(1);
        properties.setMaxConcurrentRedis(1);
        // when & then
        setter.accept(properties, minimum);
        assertValid(properties);
        setter.accept(properties, maximum);
        assertValid(properties);
        setter.accept(properties, minimum - 1);
        assertInvalid(properties, setting);
        if (maximum < Integer.MAX_VALUE) {
            setter.accept(properties, maximum + 1);
            assertInvalid(properties, setting);
        }
    }

    private static Stream<Arguments> integerLimits() {
        return Stream.of(
                integer("max-concurrent-requests", ViewportCacheProperties::setMaxConcurrentRequests, 0, 8),
                integer("max-concurrent-db", ViewportCacheProperties::setMaxConcurrentDb, 1, 15),
                integer("max-concurrent-redis", ViewportCacheProperties::setMaxConcurrentRedis, 1, 8));
    }

    private static Arguments integer(String setting, BiConsumer<ViewportCacheProperties, Integer> setter,
                                     int minimum, int maximum) {
        return Arguments.of(setting, setter, minimum, maximum);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("durationLimits")
    @DisplayName("TTL과 제한시간의 경계 및 Redis 연결시간의 선택 설정 의미를 유지한다")
    void preserves_duration_boundaries(String setting, BiConsumer<ViewportCacheProperties, Duration> setter,
                                      Duration maximum) {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setRequestTimeout(Duration.ofMinutes(1));
        properties.setCacheTimeout(Duration.ofNanos(1));
        properties.setDbTimeout(Duration.ofNanos(1));
        // when & then
        setter.accept(properties, Duration.ofNanos(1));
        assertValid(properties);
        setter.accept(properties, maximum);
        assertValid(properties);
        for (Duration invalid : new Duration[]{Duration.ZERO, Duration.ofNanos(-1), maximum.plusNanos(1)}) {
            setter.accept(properties, invalid);
            assertInvalid(properties, "jumin.viewport.cache." + setting);
        }
        setter.accept(properties, null);
        if (setting.equals("redis-connect-timeout")) {
            assertValid(properties);
            assertThat(properties.getEffectiveRedisConnectTimeout()).isEqualTo(properties.getCacheTimeout());
        } else {
            assertInvalid(properties, "jumin.viewport.cache." + setting);
        }
    }

    private static Stream<Arguments> durationLimits() {
        return Stream.of(
                duration("ttl", ViewportCacheProperties::setTtl, Duration.ofDays(1)),
                duration("empty-ttl", ViewportCacheProperties::setEmptyTtl, Duration.ofDays(1)),
                duration("request-timeout", ViewportCacheProperties::setRequestTimeout, Duration.ofMinutes(1)),
                duration("cache-timeout", ViewportCacheProperties::setCacheTimeout, Duration.ofMinutes(1)),
                duration("db-timeout", ViewportCacheProperties::setDbTimeout, Duration.ofMinutes(1)),
                duration("redis-connect-timeout", ViewportCacheProperties::setRedisConnectTimeout, Duration.ofMinutes(1)));
    }

    private static Arguments duration(String setting, BiConsumer<ViewportCacheProperties, Duration> setter,
                                      Duration maximum) {
        return Arguments.of(setting, setter, maximum);
    }

    @Test
    @DisplayName("고정 처리 예산에서 요청 메모리 32 MiB 경계를 유지한다")
    void preserves_request_memory_boundary() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxConcurrentRequests(8);
        assertValid(properties);
        // when
        properties.setMaxConcurrentRequests(9);
        // then
        assertInvalid(properties, "max-concurrent-requests");
    }

    @Test
    @DisplayName("Redis 메모리 64 MiB 경계 초과는 관련 설정명을 모두 표시한다")
    void preserves_redis_memory_boundary() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxConcurrentDb(1);
        properties.setMaxConcurrentRedis(8);
        assertValid(properties);
        // when
        properties.setMaxConcurrentRedis(9);
        // then
        assertInvalid(properties, "max-concurrent-redis");
    }

    @Test
    @DisplayName("전체 메모리 128 MiB 경계와 초과 거절을 유지한다")
    void preserves_combined_memory_boundary() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxConcurrentDb(9);
        properties.setMaxConcurrentRedis(7);
        assertValid(properties);
        // when
        properties.setMaxConcurrentDb(10);
        // then
        assertInvalid(properties, "max-concurrent-requests", "max-concurrent-db", "max-concurrent-redis");
    }

    @Test
    @DisplayName("공유 캐시는 환경의 명시 설정이 필요하며 오류에 설정값을 노출하지 않는다")
    void preserves_environment_validation_without_exposing_values() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setEnabled(true);
        // when & then
        assertInvalid(properties, "jumin.viewport.cache.environment");
        for (String valid : new String[]{"a", "A_0-" + "x".repeat(44)}) {
            properties.setEnvironment(valid);
            assertValid(properties);
        }
        for (String invalid : new String[]{null, "", "x".repeat(49), "password=private-value"}) {
            properties.setEnvironment(invalid);
            assertInvalid(properties, "jumin.viewport.cache.environment");
            assertThat(VALIDATOR.validate(properties)).extracting(ConstraintViolation::getMessage)
                    .allSatisfy(message -> assertThat(message).doesNotContain("password=private-value"));
        }
    }

    @Test
    @DisplayName("필수 Duration과 다른 범위가 동시에 잘못돼도 검증 순서에 따른 예외 없이 거절한다")
    void validates_missing_durations_without_depending_on_constraint_order() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setTtl(null);
        properties.setEmptyTtl(null);
        properties.setRequestTimeout(null);
        properties.setCacheTimeout(null);
        properties.setDbTimeout(null);
        properties.setMaxConcurrentRequests(Integer.MAX_VALUE);
        properties.setMaxConcurrentDb(Integer.MAX_VALUE);
        properties.setMaxConcurrentRedis(Integer.MAX_VALUE);

        // when
        var violations = VALIDATOR.validate(properties);

        // then
        for (String setting : new String[]{"ttl", "empty-ttl", "request-timeout", "cache-timeout", "db-timeout"}) {
            assertThat(violations).anySatisfy(violation ->
                    assertThat(violation.getMessage()).contains("jumin.viewport.cache." + setting));
        }
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("bindingCases")
    @DisplayName("설정 바인딩만으로 경계값을 허용하고 잘못된 설정의 시작을 거부한다")
    void validates_during_configuration_binding(String name, String expectedSetting,
                                               Class<? extends Throwable> expectedFailure, String[] settings) {
        // given
        ApplicationContextRunner runner = new ApplicationContextRunner()
                .withUserConfiguration(BindingConfiguration.class)
                .withPropertyValues(Stream.of(settings)
                        .map(value -> "jumin.viewport.cache." + value).toArray(String[]::new));

        // when & then
        runner.run(context -> {
            if (expectedSetting == null) {
                assertThat(context).hasNotFailed();
                assertValid(context.getBean(ViewportCacheProperties.class));
                return;
            }
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).hasRootCauseInstanceOf(expectedFailure)
                    .hasStackTraceContaining("jumin.viewport.cache").hasStackTraceContaining(expectedSetting);
        });
    }

    @Test
    @DisplayName("이전 외부 셀 설정은 고정된 캐시 정책을 바꾸지 못한다")
    void ignores_removed_cell_policy_settings() {
        // given
        ApplicationContextRunner runner = new ApplicationContextRunner()
                .withUserConfiguration(BindingConfiguration.class, ViewportSquareGrid.class, ViewportCellCover.class)
                .withPropertyValues("jumin.viewport.cache.grid-size-meters=2000",
                        "jumin.viewport.cache.max-span-degrees=0.001", "jumin.viewport.cache.max-cells=1",
                        "jumin.viewport.cache.max-cell-rows=1", "jumin.viewport.cache.max-value-bytes=1",
                        "jumin.viewport.cache.max-inflight-cells=1", "jumin.viewport.cache.db-queue=1",
                        "jumin.viewport.cache.max-request-bytes=1", "jumin.viewport.cache.max-fallback-rows=1");
        // when & then
        runner.run(context -> {
            assertThat(context).hasNotFailed();
            ViewportBounds bounds = new ViewportBounds(127, 37.5, 127.04, 37.54);
            assertThat(context.getBean(ViewportCellCover.class).cover(bounds))
                    .isEqualTo(new ViewportSquareGrid().cover(bounds, 1000, 64)).hasSizeGreaterThan(1);
        });
    }

    private static Stream<Arguments> bindingCases() {
        return Stream.of(
                binding("기본 설정", null),
                binding("캐시 활성화와 기본 환경 명시", null, "enabled=true", "environment=local"),
                binding("캐시 비활성화 중 잘못된 정수", "max-concurrent-db", "max-concurrent-db=0"),
                binding("활성화 중 환경 누락", "environment", "enabled=true"),
                Arguments.of("내부 상태 설정으로 환경 명시를 우회하지 못함", "environment",
                        BindValidationException.class, new String[]{"enabled=true", "environment-configured=true"}),
                binding("요청 메모리 경계", null, "max-concurrent-requests=8"),
                binding("요청 메모리 초과", "max-concurrent-requests", "max-concurrent-requests=9"),
                binding("Redis 메모리 경계", null, "max-concurrent-db=1", "max-concurrent-redis=8"),
                binding("Redis 메모리 초과", "max-concurrent-redis", "max-concurrent-db=1", "max-concurrent-redis=9"),
                binding("전체 메모리 경계", null, "max-concurrent-db=9", "max-concurrent-redis=7"),
                binding("전체 메모리 초과", "max-concurrent-db", "max-concurrent-db=10",
                        "max-concurrent-redis=7"),
                binding("요청보다 긴 캐시 제한시간", "cache-timeout", "cache-timeout=3s"),
                binding("선택 연결 제한시간 경계", null, "redis-connect-timeout=2s"),
                binding("요청보다 긴 연결 제한시간", "redis-connect-timeout", "redis-connect-timeout=3s"),
                binding("TTL 경계", null, "ttl=24h", "empty-ttl=24h"),
                binding("TTL 초과", "ttl", "ttl=P1DT0.000000001S")
        );
    }

    private static Arguments binding(String name, String expectedSetting, String... settings) {
        return Arguments.of(name, expectedSetting, BindValidationException.class, settings);
    }

    @Test
    @DisplayName("빈 제한시간 문자열을 바인딩하면 기존 기본값을 유지한다")
    void empty_duration_keeps_default_during_binding() {
        // given
        ApplicationContextRunner runner = new ApplicationContextRunner()
                .withUserConfiguration(BindingConfiguration.class)
                .withPropertyValues("jumin.viewport.cache.request-timeout=");

        // when & then
        runner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(ViewportCacheProperties.class).getRequestTimeout())
                    .isEqualTo(Duration.ofSeconds(2));
        });
    }

    @Test
    @ExtendWith(OutputCaptureExtension.class)
    @DisplayName("바인딩 검증 실패도 잘못된 환경 값과 비밀을 예외 및 로그에 노출하지 않는다")
    void binding_failure_does_not_expose_invalid_environment(CapturedOutput output) {
        // given
        String secret = "password=private-value";
        ApplicationContextRunner runner = new ApplicationContextRunner()
                .withUserConfiguration(BindingConfiguration.class)
                .withPropertyValues("jumin.viewport.cache.enabled=true", "jumin.viewport.cache.environment=" + secret);

        // when & then
        runner.run(context -> {
            assertThat(context).hasFailed();
            Throwable failure = context.getStartupFailure();
            assertThat(failure).hasRootCauseInstanceOf(BindValidationException.class);
            StringWriter trace = new StringWriter();
            failure.printStackTrace(new PrintWriter(trace));
            assertThat(trace.toString()).contains("jumin.viewport.cache.environment").doesNotContain(secret);
        });
        assertThat(output).doesNotContain(secret);
    }

    private static void assertValid(ViewportCacheProperties properties) {
        assertThat(VALIDATOR.validate(properties)).isEmpty();
    }

    private static void assertInvalid(ViewportCacheProperties properties, String... settings) {
        var violations = VALIDATOR.validate(properties);
        assertThat(violations).isNotEmpty();
        if (settings.length == 0) {
            return;
        }
        assertThat(violations).anySatisfy(violation -> assertThat(violation.getMessage()).contains(settings));
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(ViewportCacheProperties.class)
    static class BindingConfiguration {
    }
}
