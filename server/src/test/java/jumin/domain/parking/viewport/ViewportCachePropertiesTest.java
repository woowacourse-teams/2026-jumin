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
        assertThat(properties.getRedisTransportThreads()).isEqualTo(3);
        assertThat(properties.getMaxConcurrentRequests()).isZero();
    }

    @Test
    @DisplayName("공유 DB 대기열과 Redis transport 동시성의 설정 범위를 검증한다")
    void rejects_invalid_capacities() {
        ViewportCacheProperties properties = new ViewportCacheProperties();

        properties.setDbQueue(0);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
        properties.setDbQueue(513);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
        properties.setDbQueue(32);
        properties.setRedisTransportThreads(0);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
        properties.setRedisTransportThreads(17);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("Redis transport 추정치를 기존 전체 예산에 합산하고 별도 상한도 검증한다")
    void validates_combined_and_redis_memory_budgets() {
        ViewportCacheProperties properties = new ViewportCacheProperties();
        properties.setMaxConcurrentRequests(8);

        properties.validate();
        properties.setRedisTransportThreads(6);
        properties.validate();
        properties.setRedisTransportThreads(8);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);

        properties.setMaxConcurrentRequests(0);
        properties.setMaxConcurrentDb(1);
        properties.setLoaderThreads(1);
        properties.validate();
        properties.setRedisTransportThreads(9);
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
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
