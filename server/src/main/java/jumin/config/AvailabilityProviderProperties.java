package jumin.config;

import jakarta.annotation.Nonnull;

public record AvailabilityProviderProperties(String baseUrl, String apiKey) {

    @Override
    @Nonnull
    public String toString() {
        return "Provider[baseUrl=" + baseUrl + ", apiKey=REDACTED]";
    }
}
