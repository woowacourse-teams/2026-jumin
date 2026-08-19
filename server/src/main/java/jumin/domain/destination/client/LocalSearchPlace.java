package jumin.domain.destination.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record LocalSearchPlace(
        String title,
        String address,
        String roadAddress,
        String mapx,
        String mapy
) {
}
