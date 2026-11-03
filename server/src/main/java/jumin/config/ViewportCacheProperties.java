package jumin.config;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.validator.constraints.time.DurationMax;
import org.hibernate.validator.constraints.time.DurationMin;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@Getter
@Setter
@ConfigurationProperties("jumin.viewport.cache")
public class ViewportCacheProperties {

    public static final int GRID_SIZE_METERS = 1000;
    public static final double MAX_SPAN_DEGREES = 0.05;
    public static final int MAX_CELLS = 64;
    public static final int MAX_CELL_ROWS = 4096;
    public static final int MAX_VALUE_BYTES = 256 * 1024;
    public static final int MAX_INFLIGHT_CELLS = 2048;
    public static final int DB_QUEUE = 256;
    public static final int MAX_REQUEST_BYTES = 4 * 1024 * 1024;
    public static final int MAX_VIEWPORT_ROWS = 1_000_000;

    private boolean enabled;
    private boolean prepareOnStartup;
    private String environment = "local";
    @Getter(AccessLevel.NONE)
    @Setter(AccessLevel.NONE)
    private boolean environmentConfigured;
    @Min(value = 1, message = "jumin.viewport.cache.max-concurrent-db는 1 이상이어야 합니다.")
    @Max(value = 16, message = "jumin.viewport.cache.max-concurrent-db는 16 이하여야 합니다.")
    private int maxConcurrentDb = 3;
    @Min(value = 1, message = "jumin.viewport.cache.max-concurrent-redis는 1 이상이어야 합니다.")
    @Max(value = 16, message = "jumin.viewport.cache.max-concurrent-redis는 16 이하여야 합니다.")
    private int maxConcurrentRedis = 3;
    @NotNull(message = "jumin.viewport.cache.ttl 값이 필요합니다.")
    @DurationMin(nanos = 1, message = "jumin.viewport.cache.ttl는 0보다 커야 합니다.")
    @DurationMax(days = 1, message = "jumin.viewport.cache.ttl는 1일 이하여야 합니다.")
    private Duration ttl = Duration.ofMinutes(10);
    @NotNull(message = "jumin.viewport.cache.empty-ttl 값이 필요합니다.")
    @DurationMin(nanos = 1, message = "jumin.viewport.cache.empty-ttl는 0보다 커야 합니다.")
    @DurationMax(days = 1, message = "jumin.viewport.cache.empty-ttl는 1일 이하여야 합니다.")
    private Duration emptyTtl = Duration.ofMinutes(1);
    @NotNull(message = "jumin.viewport.cache.request-timeout 값이 필요합니다.")
    @DurationMin(nanos = 1, message = "jumin.viewport.cache.request-timeout는 0보다 커야 합니다.")
    @DurationMax(minutes = 1, message = "jumin.viewport.cache.request-timeout은 1분 이하여야 합니다.")
    private Duration requestTimeout = Duration.ofSeconds(2);
    @NotNull(message = "jumin.viewport.cache.cache-timeout 값이 필요합니다.")
    @DurationMin(nanos = 1, message = "jumin.viewport.cache.cache-timeout는 0보다 커야 합니다.")
    private Duration cacheTimeout = Duration.ofMillis(500);
    @DurationMin(nanos = 1, message = "jumin.viewport.cache.redis-connect-timeout는 0보다 커야 합니다.")
    private Duration redisConnectTimeout;
    @NotNull(message = "jumin.viewport.cache.db-timeout 값이 필요합니다.")
    @DurationMin(nanos = 1, message = "jumin.viewport.cache.db-timeout는 0보다 커야 합니다.")
    private Duration dbTimeout = Duration.ofSeconds(1);
    private String redisUri = "redis://127.0.0.1:56379";
    private String redisUsername;
    private String redisPassword;
    private String redisTlsCaFile;

    public void setEnvironment(String environment) {
        this.environment = environment;
        this.environmentConfigured = true;
    }

    public Duration getEffectiveRedisConnectTimeout() {
        if (redisConnectTimeout == null) {
            return cacheTimeout;
        }
        return redisConnectTimeout;
    }

    @AssertTrue(message = "jumin.viewport.cache.max-concurrent-redis의 메모리 한도는 64 MiB입니다(고정 처리 예산 4 MiB).")
    public boolean isRedisMemoryWithinBudget() {
        return 2L * maxConcurrentRedis * MAX_REQUEST_BYTES <= 64L * 1024 * 1024;
    }

    @AssertTrue(message = "jumin.viewport.cache.max-concurrent-db / max-concurrent-redis의 "
            + "전체 메모리 한도는 128 MiB입니다(고정 처리 예산 4 MiB).")
    public boolean isCombinedMemoryWithinBudget() {
        long concurrentCopies = 2L * maxConcurrentDb + 2L * maxConcurrentRedis;
        return concurrentCopies * MAX_REQUEST_BYTES <= 128L * 1024 * 1024;
    }

    @AssertTrue(message = "jumin.viewport.cache.cache-timeout은 request-timeout 이하여야 합니다.")
    public boolean isCacheTimeoutWithinRequest() {
        return withinRequestTimeout(cacheTimeout);
    }

    @AssertTrue(message = "jumin.viewport.cache.db-timeout은 request-timeout 이하여야 합니다.")
    public boolean isDbTimeoutWithinRequest() {
        return withinRequestTimeout(dbTimeout);
    }

    @AssertTrue(message = "jumin.viewport.cache.redis-connect-timeout은 request-timeout 이하여야 합니다.")
    public boolean isRedisConnectTimeoutWithinRequest() {
        return withinRequestTimeout(redisConnectTimeout);
    }

    private boolean withinRequestTimeout(Duration timeout) {
        return timeout == null || requestTimeout == null || timeout.compareTo(requestTimeout) <= 0;
    }

    @AssertTrue(message = "jumin.viewport.cache.environment의 형식을 확인하고 캐시 사용 시 명시적으로 설정하세요.")
    public boolean isEnvironmentValid() {
        if (enabled && !environmentConfigured) {
            return false;
        }
        return environment != null && environment.matches("[a-zA-Z0-9_-]{1,48}");
    }
}
