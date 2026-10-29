package jumin.config;

import io.micrometer.observation.ObservationRegistry;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.client.RestClient;

@Configuration
@EnableScheduling
@EnableConfigurationProperties(AvailabilityProperties.class)
public class AvailabilityConfig {

    @Bean
    public RestClient seoulAvailabilityRestClient(RestClient.Builder builder, AvailabilityProperties properties) {
        return builder.clone()
                .baseUrl(properties.seoul().baseUrl())
                .observationRegistry(ObservationRegistry.NOOP)
                .build();
    }

    @Bean
    public RestClient busanAvailabilityRestClient(RestClient.Builder builder, AvailabilityProperties properties) {
        return builder.clone()
                .baseUrl(properties.busan().baseUrl())
                .observationRegistry(ObservationRegistry.NOOP)
                .build();
    }
}
