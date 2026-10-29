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

    public enum Store { NONE, CAFFEINE, REDIS }

    private boolean enabled;
    private boolean projectionOnly;
    private boolean prepareOnStartup;
    // False explicitly opts into TTL-only freshness, including on full cache hits.
    private boolean versionCheckEnabled = true;
    private boolean singleflight = true;
    private String environment = "local";
    @Setter(AccessLevel.NONE)
    private boolean environmentConfigured;
    private String readUsername;
    private String readPassword;
    private String observerUsername;
    private String observerPassword;
    private Store store = Store.CAFFEINE;
    private int gridSizeMeters = 1000;
    private int schema = 1;
    private int policy = 1;
    private int maxCells = 64;
    private int maxCellRows = 4096;
    private int maxValueBytes = 256 * 1024;
    private int maxRequestBytes = 4 * 1024 * 1024;
    private int maxFallbackRows = 1_000_000;
    private long maxSpoolBytes = 64L * 1024 * 1024;
    private long maxTotalSpoolBytes = 256L * 1024 * 1024;
    // Zero disables admission and cannot bound the aggregate memory of simultaneous requests.
    private int maxConcurrentRequests = 8;
    private long maximumWeight = 32L * 1024 * 1024;
    private int maxConcurrentDb = 3;
    private int dbQueue = 256;
    private int metadataDbWorkers;
    private int metadataDbQueue = 32;
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
    // Null preserves the original behavior for installations that only set cacheTimeout.
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

    public int getEffectiveMetadataDbWorkers() {
        return maxConcurrentDb <= 1 ? 0 : Math.min(metadataDbWorkers, maxConcurrentDb - 1);
    }

    public Duration getEffectiveRedisConnectTimeout() {
        return redisConnectTimeout == null ? cacheTimeout : redisConnectTimeout;
    }

    public void validate() {
        if (gridSizeMeters < 100 || gridSizeMeters > 20_000 || schema < 1 || policy < 1 || maxCells < 1 || maxCells > 256
                || maxCellRows < 1 || maxCellRows > 16_384 || maxFallbackRows < 1 || maxFallbackRows > 1_000_000
                || maxSpoolBytes < maxRequestBytes || maxSpoolBytes > 128L * 1024 * 1024
                || maxTotalSpoolBytes < maxSpoolBytes || maxTotalSpoolBytes > 1024L * 1024 * 1024
                || maxConcurrentRequests < 0 || maxConcurrentRequests > 64
                || (maxConcurrentRequests > 0
                    && (long) maxRequestBytes * maxConcurrentRequests > 32L * 1024 * 1024)
                || store == null
                || maxValueBytes < 256 || maxValueBytes > 1024 * 1024 || maxRequestBytes < maxValueBytes
                || maximumWeight < maxValueBytes || maximumWeight > 64L * 1024 * 1024
                || maxRequestBytes < 320 || maxRequestBytes > 8 * 1024 * 1024
                || (maxConcurrentRequests + 2L * maxConcurrentDb + 2L * loaderThreads
                    + (store == Store.REDIS ? 2L * redisTransportThreads : 0)) * maxRequestBytes
                    + (store == Store.REDIS ? 0 : maximumWeight) > 128L * 1024 * 1024
                || maxConcurrentDb < 1 || maxConcurrentDb > 16
                || dbQueue < 1 || dbQueue > 512 || metadataDbWorkers < 0 || metadataDbWorkers > 16
                || metadataDbQueue < 1 || metadataDbQueue > 512
                || loaderThreads < 1 || loaderThreads > 16 || loaderQueue < 1 || loaderQueue > 512
                || redisTransportThreads < 1 || redisTransportThreads > 16
                // Each concurrent Redis batch can retain both wire data and decoded data.
                || (store == Store.REDIS && 2L * redisTransportThreads * maxRequestBytes > 64L * 1024 * 1024)
                || maxInflightCells < maxCells || maxInflightCells > 4096
                || !Double.isFinite(maxWidthDegrees) || maxWidthDegrees <= 0 || maxWidthDegrees > 0.1
                || !Double.isFinite(maxHeightDegrees) || maxHeightDegrees <= 0 || maxHeightDegrees > 0.1
                || !Double.isFinite(ttlJitter) || ttlJitter < 0 || ttlJitter > 0.5
                || ttl == null || ttl.isNegative() || ttl.isZero() || ttl.compareTo(Duration.ofDays(1)) > 0
                || emptyTtl == null || emptyTtl.isNegative() || emptyTtl.isZero()
                || emptyTtl.compareTo(Duration.ofDays(1)) > 0
                || requestTimeout == null || requestTimeout.isNegative() || requestTimeout.isZero()
                || cacheTimeout == null || cacheTimeout.isNegative() || cacheTimeout.isZero()
                || (redisConnectTimeout != null && (redisConnectTimeout.isNegative() || redisConnectTimeout.isZero()
                    || redisConnectTimeout.compareTo(requestTimeout) > 0))
                || dbTimeout == null || dbTimeout.isNegative() || dbTimeout.isZero()
                || requestTimeout.compareTo(Duration.ofMinutes(1)) > 0
                || cacheTimeout.compareTo(requestTimeout) > 0 || dbTimeout.compareTo(requestTimeout) > 0
                || environment == null || !environment.matches("[a-zA-Z0-9_-]{1,48}")) {
            throw new IllegalArgumentException("viewport 캐시 설정의 범위와 자원 한도를 확인하세요.");
        }
        if (enabled && (readUsername == null || readUsername.isBlank()
                || readPassword == null || readPassword.isBlank()
                || observerUsername == null || observerUsername.isBlank()
                || observerPassword == null || observerPassword.isBlank()
                || readUsername.equals(observerUsername))) {
            throw new IllegalArgumentException("캐시를 켜기 전에 연결 수가 제한된 전용 읽기 계정을 설정하세요.");
        }
        if (enabled && store == Store.REDIS && !environmentConfigured) {
            throw new IllegalArgumentException("공유 캐시의 environment를 명시적으로 설정하세요.");
        }
    }
}
