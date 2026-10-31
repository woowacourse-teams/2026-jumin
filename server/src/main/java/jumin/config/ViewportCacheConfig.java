package jumin.config;

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
    public ViewportCellCodec viewportCellCodec(ViewportCacheProperties properties) {
        properties.validate();
        return new ViewportCellCodec(properties.getMaxValueBytes(), properties.getMaxCellRows());
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
