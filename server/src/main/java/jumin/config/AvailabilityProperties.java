package jumin.config;

import jakarta.annotation.Nonnull;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("parking.availability")
public record AvailabilityProperties(
        boolean enabled,
        Provider seoul,
        Provider busan
) {
    public record Provider(String baseUrl, String apiKey) {
        @Override
        @Nonnull
        public String toString() {
            return "Provider[baseUrl=" + baseUrl + ", apiKey=REDACTED]";
        }
    }
}
