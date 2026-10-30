package jumin.config;

import java.time.Duration;
import lombok.Getter;
import lombok.AccessLevel;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties("jumin.viewport.cache")
public class ViewportCacheProperties {

    private boolean enabled;
    private boolean prepareOnStartup;
    private boolean singleflight = true;
    private String environment = "local";
    @Setter(AccessLevel.NONE)
    private boolean environmentConfigured;
    private int gridSizeMeters = 1000;
    private int schema = 1;
    private int policy = 1;
    private int maxCells = 64;
    private int maxCellRows = 4096;
    private int maxValueBytes = 256 * 1024;
    private int maxRequestBytes = 4 * 1024 * 1024;
    private int maxFallbackRows = 1_000_000;
    private int maxConcurrentRequests;
    private int maxConcurrentDb = 3;
    private int dbQueue = 256;
    private int loaderThreads = 3;
    private int loaderQueue = 32;
    private int redisTransportThreads = 3;
    private int maxInflightCells = 2048;
    private double maxWidthDegrees = 0.05;
    private double maxHeightDegrees = 0.05;
    private Duration ttl = Duration.ofMinutes(10);
    private Duration emptyTtl = Duration.ofMinutes(1);
    private double ttlJitter = 0.2;
    private Duration requestTimeout = Duration.ofSeconds(2);
    private Duration cacheTimeout = Duration.ofMillis(500);
    private Duration redisConnectTimeout;
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

    public void validate() {
        if (hasInvalidDataLimits() || hasInvalidExecutionLimits() || hasInvalidCachePolicy()) {
            throw new IllegalArgumentException("viewport 캐시 설정의 범위와 자원 한도를 확인하세요.");
        }
        if (enabled && !environmentConfigured) {
            throw new IllegalArgumentException("공유 캐시의 environment를 명시적으로 설정하세요.");
        }
    }

    private boolean hasInvalidDataLimits() {
        return hasInvalidGridSettings() || hasInvalidRowLimits()
                || hasInvalidRequestAdmission() || hasInvalidByteLimits();
    }

    private boolean hasInvalidExecutionLimits() {
        return exceedsCombinedMemoryBudget() || hasInvalidDatabaseLimits() || hasInvalidLoaderLimits()
                || hasInvalidRedisLimits() || hasInvalidInflightLimit();
    }

    private boolean hasInvalidCachePolicy() {
        return hasInvalidViewportDimensions() || hasInvalidTtlJitter() || hasInvalidTtls()
                || hasInvalidTimeouts() || hasInvalidEnvironment();
    }

    private boolean hasInvalidGridSettings() {
        return gridSizeMeters < 100 || gridSizeMeters > 20_000 || schema < 1 || policy < 1
                || maxCells < 1 || maxCells > 256;
    }

    private boolean hasInvalidRowLimits() {
        return maxCellRows < 1 || maxCellRows > 16_384 || maxFallbackRows < 1 || maxFallbackRows > 1_000_000;
    }

    private boolean hasInvalidRequestAdmission() {
        return maxConcurrentRequests < 0 || maxConcurrentRequests > 64
                || (maxConcurrentRequests > 0
                    && (long) maxRequestBytes * maxConcurrentRequests > 32L * 1024 * 1024);
    }

    private boolean hasInvalidByteLimits() {
        return maxValueBytes < 256 || maxValueBytes > 1024 * 1024 || maxRequestBytes < maxValueBytes
                || maxRequestBytes < 320 || maxRequestBytes > 8 * 1024 * 1024;
    }

    private boolean exceedsCombinedMemoryBudget() {
        return (maxConcurrentRequests + 2L * maxConcurrentDb + 2L * loaderThreads
                + 2L * redisTransportThreads) * maxRequestBytes > 128L * 1024 * 1024;
    }

    private boolean hasInvalidDatabaseLimits() {
        return maxConcurrentDb < 1 || maxConcurrentDb > 16 || dbQueue < 1 || dbQueue > 512;
    }

    private boolean hasInvalidLoaderLimits() {
        return loaderThreads < 1 || loaderThreads > 16 || loaderQueue < 1 || loaderQueue > 512;
    }

    private boolean hasInvalidRedisLimits() {
        return redisTransportThreads < 1 || redisTransportThreads > 16
                || 2L * redisTransportThreads * maxRequestBytes > 64L * 1024 * 1024;
    }

    private boolean hasInvalidInflightLimit() {
        return maxInflightCells < maxCells || maxInflightCells > 4096;
    }

    private boolean hasInvalidViewportDimensions() {
        return !Double.isFinite(maxWidthDegrees) || maxWidthDegrees <= 0 || maxWidthDegrees > 0.1
                || !Double.isFinite(maxHeightDegrees) || maxHeightDegrees <= 0 || maxHeightDegrees > 0.1;
    }

    private boolean hasInvalidTtlJitter() {
        return !Double.isFinite(ttlJitter) || ttlJitter < 0 || ttlJitter > 0.5;
    }

    private boolean hasInvalidTtls() {
        return isMissingOrNonPositive(ttl) || ttl.compareTo(Duration.ofDays(1)) > 0
                || isMissingOrNonPositive(emptyTtl) || emptyTtl.compareTo(Duration.ofDays(1)) > 0;
    }

    private boolean hasInvalidTimeouts() {
        return isMissingOrNonPositive(requestTimeout) || isMissingOrNonPositive(cacheTimeout)
                || hasInvalidRedisConnectTimeout() || isMissingOrNonPositive(dbTimeout)
                || requestTimeout.compareTo(Duration.ofMinutes(1)) > 0
                || cacheTimeout.compareTo(requestTimeout) > 0 || dbTimeout.compareTo(requestTimeout) > 0;
    }

    private boolean hasInvalidRedisConnectTimeout() {
        return redisConnectTimeout != null && (redisConnectTimeout.isNegative() || redisConnectTimeout.isZero()
                || redisConnectTimeout.compareTo(requestTimeout) > 0);
    }

    private static boolean isMissingOrNonPositive(Duration duration) {
        return duration == null || duration.isNegative() || duration.isZero();
    }

    private boolean hasInvalidEnvironment() {
        return environment == null || !environment.matches("[a-zA-Z0-9_-]{1,48}");
    }
}
