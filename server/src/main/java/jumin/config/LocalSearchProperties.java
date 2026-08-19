package jumin.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "local-search")
public record LocalSearchProperties(
        String baseUrl,
        String clientId,
        String clientSecret
) {
}
