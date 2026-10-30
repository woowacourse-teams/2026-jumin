package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.function.BiConsumer;
import java.util.stream.Stream;
import jumin.config.ViewportCacheProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class ViewportCachePropertiesTest {

    @Test
    @DisplayName("DB 대기 한도와 동기 Redis 동시성 기본값을 적용한다")
    void separates_default_capacity_settings() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();

        // when
        properties.validate();

        // then
        assertThat(properties.getMaxConcurrentDb()).isEqualTo(3);
        assertThat(properties.getDbQueue()).isEqualTo(256);
        assertThat(properties.getMaxConcurrentRedis()).isEqualTo(3);
        assertThat(properties.getMaxConcurrentRequests()).isZero();
    }

    @Test
    @DisplayName("공유 DB 대기열과 Redis transport 동시성의 설정 범위를 검증한다")
    void rejects_invalid_capacities() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();

        // when & then
        properties.setDbQueue(0);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
        properties.setDbQueue(513);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
        properties.setDbQueue(32);
        properties.setMaxConcurrentRedis(0);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
        properties.setMaxConcurrentRedis(17);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Redis transport 추정치를 기존 전체 예산에 합산하고 별도 상한도 검증한다")
    void validates_combined_and_redis_memory_budgets() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxConcurrentRequests(8);

        // when & then
        properties.validate();
        properties.setMaxConcurrentDb(16);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
        properties.setMaxConcurrentDb(3);
        properties.setMaxConcurrentRedis(6);
        properties.validate();
        properties.setMaxConcurrentRedis(9);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);

        properties.setMaxConcurrentRequests(0);
        properties.setMaxConcurrentDb(1);
        properties.setMaxConcurrentRedis(8);
        properties.validate();
        properties.setMaxConcurrentRedis(9);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
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
        properties.validate();
        properties.setRedisConnectTimeout(Duration.ZERO);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
        properties.setRedisConnectTimeout(Duration.ofSeconds(3));
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
    }
    @ParameterizedTest(name = "{0}")
    @MethodSource("integerLimits")
    @DisplayName("정수 설정은 기존 최솟값과 최댓값을 허용하고 범위 밖에서는 설정명을 표시한다")
    void preserves_integer_boundaries(String setting, BiConsumer<ViewportCacheProperties, Integer> setter,
                                     int minimum, int maximum) {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxCells(1);
        properties.setMaxInflightCells(4096);
        properties.setMaxValueBytes(256);
        properties.setMaxRequestBytes(setting.equals("max-value-bytes") ? 8 * 1024 * 1024 : 512);
        // when & then
        setter.accept(properties, minimum);
        properties.validate();
        setter.accept(properties, maximum);
        properties.validate();
        setter.accept(properties, minimum - 1);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("jumin.viewport.cache." + setting);
        if (maximum < Integer.MAX_VALUE) {
            setter.accept(properties, maximum + 1);
            assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("jumin.viewport.cache." + setting);
        }
    }

    private static Stream<Arguments> integerLimits() {
        return Stream.of(
                integer("grid-size-meters", ViewportCacheProperties::setGridSizeMeters, 100, 20_000),
                integer("schema", ViewportCacheProperties::setSchema, 1, Integer.MAX_VALUE),
                integer("policy", ViewportCacheProperties::setPolicy, 1, Integer.MAX_VALUE),
                integer("max-cells", ViewportCacheProperties::setMaxCells, 1, 256),
                integer("max-cell-rows", ViewportCacheProperties::setMaxCellRows, 1, 16_384),
                integer("max-fallback-rows", ViewportCacheProperties::setMaxFallbackRows, 1, 1_000_000),
                integer("max-value-bytes", ViewportCacheProperties::setMaxValueBytes, 256, 1024 * 1024),
                integer("max-request-bytes", ViewportCacheProperties::setMaxRequestBytes, 320, 8 * 1024 * 1024),
                integer("max-concurrent-requests", ViewportCacheProperties::setMaxConcurrentRequests, 0, 64),
                integer("max-concurrent-db", ViewportCacheProperties::setMaxConcurrentDb, 1, 16),
                integer("db-queue", ViewportCacheProperties::setDbQueue, 1, 512),
                integer("max-concurrent-redis", ViewportCacheProperties::setMaxConcurrentRedis, 1, 16),
                integer("max-inflight-cells", ViewportCacheProperties::setMaxInflightCells, 1, 4096));
    }

    private static Arguments integer(String setting, BiConsumer<ViewportCacheProperties, Integer> setter,
                                     int minimum, int maximum) {
        return Arguments.of(setting, setter, minimum, maximum);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("decimalLimits")
    @DisplayName("소수 설정은 기존 경계를 유지하고 NaN과 무한대를 거절한다")
    void preserves_decimal_boundaries(String setting, BiConsumer<ViewportCacheProperties, Double> setter,
                                     double minimum, double maximum) {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        // when & then
        setter.accept(properties, minimum);
        properties.validate();
        setter.accept(properties, maximum);
        properties.validate();
        for (double invalid : new double[]{Math.nextDown(minimum), Math.nextUp(maximum),
                Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY}) {
            setter.accept(properties, invalid);
            assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("jumin.viewport.cache." + setting);
        }
    }

    private static Stream<Arguments> decimalLimits() {
        return Stream.of(
                decimal("max-width-degrees", ViewportCacheProperties::setMaxWidthDegrees, Double.MIN_VALUE, 0.1),
                decimal("max-height-degrees", ViewportCacheProperties::setMaxHeightDegrees, Double.MIN_VALUE, 0.1),
                decimal("ttl-jitter", ViewportCacheProperties::setTtlJitter, 0, 0.5));
    }

    private static Arguments decimal(String setting, BiConsumer<ViewportCacheProperties, Double> setter,
                                     double minimum, double maximum) {
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
        properties.validate();
        setter.accept(properties, maximum);
        properties.validate();
        for (Duration invalid : new Duration[]{Duration.ZERO, Duration.ofNanos(-1), maximum.plusNanos(1)}) {
            setter.accept(properties, invalid);
            assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("jumin.viewport.cache." + setting);
        }
        setter.accept(properties, null);
        if (setting.equals("redis-connect-timeout")) {
            properties.validate();
            assertThat(properties.getEffectiveRedisConnectTimeout()).isEqualTo(properties.getCacheTimeout());
        } else {
            assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("jumin.viewport.cache." + setting);
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
    @DisplayName("요청 메모리 32 MiB 경계 초과는 관련 설정명을 모두 표시한다")
    void preserves_request_memory_boundary() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxConcurrentRequests(8);
        properties.validate();
        // when
        properties.setMaxRequestBytes(4 * 1024 * 1024 + 1);
        // then
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("max-concurrent-requests").hasMessageContaining("max-request-bytes");
    }

    @Test
    @DisplayName("Redis 메모리 64 MiB 경계 초과는 관련 설정명을 모두 표시한다")
    void preserves_redis_memory_boundary() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxConcurrentDb(1);
        properties.setMaxConcurrentRedis(8);
        properties.validate();
        // when
        properties.setMaxRequestBytes(4 * 1024 * 1024 + 1);
        // then
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("max-concurrent-redis").hasMessageContaining("max-request-bytes");
    }

    @Test
    @DisplayName("전체 메모리 128 MiB 경계와 초과 거절을 유지한다")
    void preserves_combined_memory_boundary() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxConcurrentDb(9);
        properties.setMaxConcurrentRedis(7);
        properties.validate();
        // when
        properties.setMaxRequestBytes(4 * 1024 * 1024 + 1);
        // then
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("max-concurrent-requests").hasMessageContaining("max-concurrent-db")
                .hasMessageContaining("max-concurrent-redis").hasMessageContaining("max-request-bytes");
    }

    @Test
    @DisplayName("요청 용량은 셀 용량 이상이고 동시 셀 한도는 조회 셀 수 이상이어야 한다")
    void preserves_related_data_limits() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxValueBytes(1024);
        properties.setMaxRequestBytes(1024);
        properties.setMaxInflightCells(properties.getMaxCells());
        properties.validate();
        // when & then
        properties.setMaxRequestBytes(1023);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("max-request-bytes").hasMessageContaining("max-value-bytes");
        properties.setMaxRequestBytes(1024);
        properties.setMaxInflightCells(properties.getMaxCells() - 1);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("max-inflight-cells").hasMessageContaining("max-cells");
    }

    @Test
    @DisplayName("공유 캐시는 환경의 명시 설정이 필요하며 오류에 설정값을 노출하지 않는다")
    void preserves_environment_validation_without_exposing_values() {
        // given
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setEnabled(true);
        // when & then
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("jumin.viewport.cache.environment");
        for (String valid : new String[]{"a", "A_0-" + "x".repeat(44)}) {
            properties.setEnvironment(valid);
            properties.validate();
        }
        for (String invalid : new String[]{null, "", "x".repeat(49), "password=private-value"}) {
            properties.setEnvironment(invalid);
            assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("jumin.viewport.cache.environment")
                    .hasMessageNotContaining("password=private-value");
        }
    }
}
