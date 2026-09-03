package jumin.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClient.Builder;

@Configuration
@EnableConfigurationProperties(ReverseGeocodingProperties.class)
public class ReverseGeocodingConfig {

    @Bean
    public RestClient reverseGeocodingRestClient(
            Builder restClientBuilder,
            ReverseGeocodingProperties properties
    ) {
        return restClientBuilder
                .baseUrl(properties.baseUrl())
                .build();
    }
}
