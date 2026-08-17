package jumin.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
@EnableConfigurationProperties(LocalSearchProperties.class)
public class LocalSearchConfig {

    private static final String DEFAULT_BASE_URL = "https://naverapihub.apigw.ntruss.com";

    @Bean
    public RestClient localSearchRestClient(
            RestClient.Builder restClientBuilder,
            LocalSearchProperties properties
    ) {
        String baseUrl = properties.baseUrl();
        if (baseUrl == null || baseUrl.isBlank()) {
            baseUrl = DEFAULT_BASE_URL;
        }

        return restClientBuilder.baseUrl(baseUrl).build();
    }
}
