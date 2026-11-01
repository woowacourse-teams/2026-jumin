package jumin.config;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import lombok.Getter;
import lombok.AccessLevel;
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

    private boolean enabled;
    private boolean prepareOnStartup;
    private String environment = "local";
    @Setter(AccessLevel.NONE)
    private boolean environmentConfigured;
    @Min(value = 100, message = "jumin.viewport.cache.grid-size-meters는 100 이상이어야 합니다.")
    @Max(value = 20_000, message = "jumin.viewport.cache.grid-size-meters는 20000 이하여야 합니다.")
    private int gridSizeMeters = 1000;
    @Min(value = 1, message = "jumin.viewport.cache.schema는 1 이상이어야 합니다.")
    private int schema = 1;
    @Min(value = 1, message = "jumin.viewport.cache.policy는 1 이상이어야 합니다.")
    private int policy = 1;
    @Min(value = 1, message = "jumin.viewport.cache.max-cells는 1 이상이어야 합니다.")
    @Max(value = 256, message = "jumin.viewport.cache.max-cells는 256 이하여야 합니다.")
    private int maxCells = 64;
    @Min(value = 1, message = "jumin.viewport.cache.max-cell-rows는 1 이상이어야 합니다.")
    @Max(value = 16_384, message = "jumin.viewport.cache.max-cell-rows는 16384 이하여야 합니다.")
    private int maxCellRows = 4096;
    @Min(value = 256, message = "jumin.viewport.cache.max-value-bytes는 256 이상이어야 합니다.")
    @Max(value = 1_048_576, message = "jumin.viewport.cache.max-value-bytes는 1048576 이하여야 합니다.")
    private int maxValueBytes = 256 * 1024;
    @Min(value = 320, message = "jumin.viewport.cache.max-request-bytes는 320 이상이어야 합니다.")
    @Max(value = 8_388_608, message = "jumin.viewport.cache.max-request-bytes는 8388608 이하여야 합니다.")
    private int maxRequestBytes = 4 * 1024 * 1024;
    @Min(value = 1, message = "jumin.viewport.cache.max-fallback-rows는 1 이상이어야 합니다.")
    @Max(value = 1_000_000, message = "jumin.viewport.cache.max-fallback-rows는 1000000 이하여야 합니다.")
    private int maxFallbackRows = 1_000_000;
    @Min(value = 0, message = "jumin.viewport.cache.max-concurrent-requests는 0 이상이어야 합니다.")
    @Max(value = 64, message = "jumin.viewport.cache.max-concurrent-requests는 64 이하여야 합니다.")
    private int maxConcurrentRequests;
    @Min(value = 1, message = "jumin.viewport.cache.max-concurrent-db는 1 이상이어야 합니다.")
    @Max(value = 16, message = "jumin.viewport.cache.max-concurrent-db는 16 이하여야 합니다.")
    private int maxConcurrentDb = 3;
    @Min(value = 1, message = "jumin.viewport.cache.db-queue는 1 이상이어야 합니다.")
    @Max(value = 512, message = "jumin.viewport.cache.db-queue는 512 이하여야 합니다.")
    private int dbQueue = 256;
    @Min(value = 1, message = "jumin.viewport.cache.max-concurrent-redis는 1 이상이어야 합니다.")
    @Max(value = 16, message = "jumin.viewport.cache.max-concurrent-redis는 16 이하여야 합니다.")
    private int maxConcurrentRedis = 3;
    @Min(value = 1, message = "jumin.viewport.cache.max-inflight-cells는 1 이상이어야 합니다.")
    @Max(value = 4_096, message = "jumin.viewport.cache.max-inflight-cells는 4096 이하여야 합니다.")
    private int maxInflightCells = 2048;
    @DecimalMin(value = "0", inclusive = false, message = "jumin.viewport.cache.max-width-degrees의 최솟값을 확인하세요.")
    @DecimalMax(value = "0.1", message = "jumin.viewport.cache.max-width-degrees는 0.1 이하여야 합니다.")
    private double maxWidthDegrees = 0.05;
    @DecimalMin(value = "0", inclusive = false, message = "jumin.viewport.cache.max-height-degrees의 최솟값을 확인하세요.")
    @DecimalMax(value = "0.1", message = "jumin.viewport.cache.max-height-degrees는 0.1 이하여야 합니다.")
    private double maxHeightDegrees = 0.05;
    @NotNull(message = "jumin.viewport.cache.ttl 값이 필요합니다.")
    @DurationMin(nanos = 1, message = "jumin.viewport.cache.ttl는 0보다 커야 합니다.")
    @DurationMax(days = 1, message = "jumin.viewport.cache.ttl는 1일 이하여야 합니다.")
    private Duration ttl = Duration.ofMinutes(10);
    @NotNull(message = "jumin.viewport.cache.empty-ttl 값이 필요합니다.")
    @DurationMin(nanos = 1, message = "jumin.viewport.cache.empty-ttl는 0보다 커야 합니다.")
    @DurationMax(days = 1, message = "jumin.viewport.cache.empty-ttl는 1일 이하여야 합니다.")
    private Duration emptyTtl = Duration.ofMinutes(1);
    @DecimalMin(value = "0", message = "jumin.viewport.cache.ttl-jitter의 최솟값을 확인하세요.")
    @DecimalMax(value = "0.5", message = "jumin.viewport.cache.ttl-jitter는 0.5 이하여야 합니다.")
    private double ttlJitter = 0.2;
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

    @AssertTrue(message = "jumin.viewport.cache.max-request-bytes는 max-value-bytes 이상이어야 합니다.")
    public boolean isRequestCapacitySufficient() {
        return maxRequestBytes >= maxValueBytes;
    }

    @AssertTrue(message = "jumin.viewport.cache.max-inflight-cells는 max-cells 이상이어야 합니다.")
    public boolean isInflightCapacitySufficient() {
        return maxInflightCells >= maxCells;
    }

    @AssertTrue(message = "jumin.viewport.cache.max-concurrent-requests / max-request-bytes의 메모리 한도는 32 MiB입니다.")
    public boolean isRequestMemoryWithinBudget() {
        return maxConcurrentRequests == 0 || (long) maxRequestBytes * maxConcurrentRequests <= 32L * 1024 * 1024;
    }

    @AssertTrue(message = "jumin.viewport.cache.max-concurrent-redis / max-request-bytes의 메모리 한도는 64 MiB입니다.")
    public boolean isRedisMemoryWithinBudget() {
        return 2L * maxConcurrentRedis * maxRequestBytes <= 64L * 1024 * 1024;
    }

    @AssertTrue(message = "jumin.viewport.cache.max-concurrent-requests / max-concurrent-db / "
            + "max-concurrent-redis / max-request-bytes의 전체 메모리 한도는 128 MiB입니다.")
    public boolean isCombinedMemoryWithinBudget() {
        long concurrentCopies = maxConcurrentRequests + 2L * maxConcurrentDb + 2L * maxConcurrentRedis;
        return concurrentCopies * maxRequestBytes <= 128L * 1024 * 1024;
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
