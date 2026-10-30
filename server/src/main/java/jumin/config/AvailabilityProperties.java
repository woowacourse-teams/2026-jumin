package jumin.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("parking.availability")
public record AvailabilityProperties(
        boolean enabled,
        AvailabilityProviderProperties seoul,
        AvailabilityProviderProperties busan
) {
}
