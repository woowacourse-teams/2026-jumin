package jumin.config;

import static jumin.config.ViewportCacheProperties.MAX_CELL_ROWS;
import static jumin.config.ViewportCacheProperties.MAX_VALUE_BYTES;

import jumin.domain.parking.cache.RedisViewportCellStore;
import jumin.domain.parking.cache.ViewportCellCodec;
import jumin.domain.parking.cache.ViewportCellStore;
import jumin.domain.parking.monitoring.ViewportMetrics;
import jumin.domain.parking.service.ViewportCellCover;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(ViewportCacheProperties.class)
public class ViewportCacheConfig {

    @Bean
    public ViewportCellCodec viewportCellCodec() {
        return new ViewportCellCodec(MAX_VALUE_BYTES, MAX_CELL_ROWS);
    }

    @Bean(destroyMethod = "close")
    public ViewportCellStore viewportCellStore(ViewportCacheProperties properties, ViewportCellCodec codec,
                                               ViewportCellCover cover, ViewportMetrics metrics) {
        if (!properties.isEnabled()) {
            return ViewportCellStore.disabled();
        }
        return new RedisViewportCellStore(properties, codec, cover, metrics);
    }
}
