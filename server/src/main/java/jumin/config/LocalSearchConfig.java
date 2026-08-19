package jumin.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClient.Builder;

@Configuration
@EnableConfigurationProperties(LocalSearchProperties.class)
public class LocalSearchConfig {

    @Bean
    public RestClient localSearchRestClient(
        Builder restClientBuilder,
        LocalSearchProperties properties
    ) {
        return restClientBuilder.baseUrl(properties.baseUrl()).build();
    }
}
