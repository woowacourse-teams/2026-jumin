package jumin.config;

import jumin.domain.parking.viewport.ViewportCellCodec;
import jumin.domain.parking.viewport.ViewportCellCover;
import jumin.domain.parking.viewport.ViewportCellStore;
import jumin.domain.parking.viewport.NoViewportCellStore;
import jumin.domain.parking.viewport.CaffeineViewportCellStore;
import jumin.domain.parking.viewport.RedisViewportCellStore;
import jumin.domain.parking.viewport.ViewportMetrics;
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
        if (!properties.isEnabled() || properties.isProjectionOnly()) {
            return new NoViewportCellStore();
        }
        return switch (properties.getStore()) {
            case NONE -> new NoViewportCellStore();
            case CAFFEINE -> new CaffeineViewportCellStore(properties, codec, metrics);
            case REDIS -> new RedisViewportCellStore(properties, codec, cover, metrics);
        };
    }
}
