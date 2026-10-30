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
    private int maxConcurrentRedis = 3;
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
        validateDataLimits();
        validateExecutionLimits();
        validateCachePolicy();
        if (enabled && !environmentConfigured) {
            throw new IllegalArgumentException("jumin.viewport.cache.environment를 명시적으로 설정하세요.");
        }
    }

    private void validateDataLimits() {
        if (gridSizeMeters < 100 || gridSizeMeters > 20_000) {
            throw invalidSetting("grid-size-meters");
        }
        if (schema < 1) {
            throw invalidSetting("schema");
        }
        if (policy < 1) {
            throw invalidSetting("policy");
        }
        if (maxCells < 1 || maxCells > 256) {
            throw invalidSetting("max-cells");
        }
        if (maxCellRows < 1 || maxCellRows > 16_384) {
            throw invalidSetting("max-cell-rows");
        }
        if (maxFallbackRows < 1 || maxFallbackRows > 1_000_000) {
            throw invalidSetting("max-fallback-rows");
        }
        if (maxValueBytes < 256 || maxValueBytes > 1024 * 1024) {
            throw invalidSetting("max-value-bytes");
        }
        if (maxRequestBytes < 320 || maxRequestBytes > 8 * 1024 * 1024) {
            throw invalidSetting("max-request-bytes");
        }
        if (maxRequestBytes < maxValueBytes) {
            throw invalidSetting("max-request-bytes / max-value-bytes");
        }
    }

    private void validateExecutionLimits() {
        if (maxConcurrentRequests < 0 || maxConcurrentRequests > 64) {
            throw invalidSetting("max-concurrent-requests");
        }
        if (maxConcurrentDb < 1 || maxConcurrentDb > 16) {
            throw invalidSetting("max-concurrent-db");
        }
        if (dbQueue < 1 || dbQueue > 512) {
            throw invalidSetting("db-queue");
        }
        if (maxConcurrentRedis < 1 || maxConcurrentRedis > 16) {
            throw invalidSetting("max-concurrent-redis");
        }
        if (maxInflightCells < maxCells || maxInflightCells > 4096) {
            throw invalidSetting("max-inflight-cells / max-cells");
        }
        if (maxConcurrentRequests > 0
                && (long) maxRequestBytes * maxConcurrentRequests > 32L * 1024 * 1024) {
            throw invalidSetting("max-concurrent-requests / max-request-bytes");
        }
        if (2L * maxConcurrentRedis * maxRequestBytes > 64L * 1024 * 1024) {
            throw invalidSetting("max-concurrent-redis / max-request-bytes");
        }
        long concurrentCopies = maxConcurrentRequests + 2L * maxConcurrentDb + 2L * maxConcurrentRedis;
        if (concurrentCopies * maxRequestBytes > 128L * 1024 * 1024) {
            throw invalidSetting("max-concurrent-requests / max-concurrent-db / max-concurrent-redis / max-request-bytes");
        }
    }

    private void validateCachePolicy() {
        if (!Double.isFinite(maxWidthDegrees) || maxWidthDegrees <= 0 || maxWidthDegrees > 0.1) {
            throw invalidSetting("max-width-degrees");
        }
        if (!Double.isFinite(maxHeightDegrees) || maxHeightDegrees <= 0 || maxHeightDegrees > 0.1) {
            throw invalidSetting("max-height-degrees");
        }
        if (!Double.isFinite(ttlJitter) || ttlJitter < 0 || ttlJitter > 0.5) {
            throw invalidSetting("ttl-jitter");
        }
        if (isMissingOrNonPositive(ttl) || ttl.compareTo(Duration.ofDays(1)) > 0) {
            throw invalidSetting("ttl");
        }
        if (isMissingOrNonPositive(emptyTtl) || emptyTtl.compareTo(Duration.ofDays(1)) > 0) {
            throw invalidSetting("empty-ttl");
        }
        validateTimeouts();
        if (environment == null || !environment.matches("[a-zA-Z0-9_-]{1,48}")) {
            throw invalidSetting("environment");
        }
    }

    private void validateTimeouts() {
        if (isMissingOrNonPositive(requestTimeout) || requestTimeout.compareTo(Duration.ofMinutes(1)) > 0) {
            throw invalidSetting("request-timeout");
        }
        if (isMissingOrNonPositive(cacheTimeout) || cacheTimeout.compareTo(requestTimeout) > 0) {
            throw invalidSetting("cache-timeout / request-timeout");
        }
        if (isMissingOrNonPositive(dbTimeout) || dbTimeout.compareTo(requestTimeout) > 0) {
            throw invalidSetting("db-timeout / request-timeout");
        }
        if (redisConnectTimeout != null && (isMissingOrNonPositive(redisConnectTimeout)
                || redisConnectTimeout.compareTo(requestTimeout) > 0)) {
            throw invalidSetting("redis-connect-timeout / request-timeout");
        }
    }

    private static boolean isMissingOrNonPositive(Duration duration) {
        return duration == null || duration.isNegative() || duration.isZero();
    }

    private static IllegalArgumentException invalidSetting(String setting) {
        return new IllegalArgumentException("jumin.viewport.cache." + setting + " 설정의 범위와 자원 한도를 확인하세요.");
    }
}
