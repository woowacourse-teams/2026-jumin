package jumin.domain.parking.viewport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import jumin.config.ViewportCacheProperties;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ViewportCachePropertiesTest {

    @Test
    @DisplayName("DB와 loader 및 Redis의 대기열과 동시성 기본값을 독립적으로 적용한다")
    void separates_default_capacity_settings() {
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.validate();
        assertThat(properties.getMaxConcurrentDb()).isEqualTo(3);
        assertThat(properties.getDbQueue()).isEqualTo(256);
        assertThat(properties.getLoaderQueue()).isEqualTo(32);
        assertThat(properties.getMetadataDbWorkers()).isZero();
        assertThat(properties.getEffectiveMetadataDbWorkers()).isZero();
        assertThat(properties.getMetadataDbQueue()).isEqualTo(32);
        assertThat(properties.getRedisTransportThreads()).isEqualTo(3);

        properties.setMetadataDbWorkers(1);
        assertThat(properties.getEffectiveMetadataDbWorkers()).isEqualTo(1);
        properties.setMaxConcurrentDb(1);
        assertThat(properties.getEffectiveMetadataDbWorkers()).isZero();
        properties.setMaxConcurrentDb(3);
        properties.setMetadataDbWorkers(16);
        assertThat(properties.getEffectiveMetadataDbWorkers()).isEqualTo(2);
        properties.setMetadataDbWorkers(0);
        assertThat(properties.getEffectiveMetadataDbWorkers()).isZero();
        properties.validate();
    }

    @Test
    @DisplayName("예약 작업자와 대기열 및 Redis transport 동시성의 설정 범위를 검증한다")
    void rejects_invalid_capacities() {
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMetadataDbWorkers(-1);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
        properties.setMetadataDbWorkers(17);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
        properties.setMetadataDbWorkers(1);
        properties.setDbQueue(0);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
        properties.setDbQueue(513);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
        properties.setDbQueue(32);
        properties.setMetadataDbQueue(0);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
        properties.setMetadataDbQueue(513);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
        properties.setMetadataDbQueue(32);
        properties.setRedisTransportThreads(0);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
        properties.setRedisTransportThreads(17);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Redis transport 추정치를 기존 전체 예산에 합산하고 별도 상한도 검증한다")
    void validates_combined_and_redis_memory_budgets() {
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setStore(ViewportCacheProperties.Store.REDIS);
        properties.validate(); // (8 + 6 + 6 + 6) * 4 MiB = 104 MiB.
        properties.setRedisTransportThreads(6);
        properties.validate(); // Exactly 128 MiB combined.
        properties.setRedisTransportThreads(8);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class); // 144 MiB.

        properties.setMaxConcurrentRequests(0);
        properties.setMaxConcurrentDb(1);
        properties.setLoaderThreads(1);
        properties.validate(); // Eight four-MiB wire/decoded pairs exactly meet the separate 64 MiB limit.
        properties.setRedisTransportThreads(9);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Caffeine과 NONE은 기존 최대 캐시 무게를 포함하고 Redis batch 예산은 포함하지 않는다")
    void retains_non_redis_memory_budget() {
        for (ViewportCacheProperties.Store store : new ViewportCacheProperties.Store[] {
                ViewportCacheProperties.Store.CAFFEINE, ViewportCacheProperties.Store.NONE }) {
            ViewportCacheProperties properties = new ViewportCacheProperties();
            properties.setStore(store);
            properties.setRedisTransportThreads(16);
            properties.validate(); // (8 + 6 + 6) * 4 MiB + 32 MiB = 112 MiB.
            properties.setMaxConcurrentDb(6);
            assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class); // 136 MiB.
        }
    }

    @Test
    @DisplayName("연결 제한시간 미설정 시 기존 cache 설정을 따르고 명시값을 별도로 검증한다")
    void falls_back_to_cache_timeout_for_redis_connect() {
        ViewportCacheProperties properties = new ViewportCacheProperties();
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
}
