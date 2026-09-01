package jumin.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "reverse-geocoding")
public record ReverseGeocodingProperties(
        String baseUrl,
        String clientId,
        String clientSecret
) {
}
