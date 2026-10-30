package jumin.domain.destination.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public record LocalSearchPlace(
        @JsonProperty("id")
        String placeId,
        @JsonProperty("place_name")
        String placeName,
        @JsonProperty("address_name")
        String addressName,
        @JsonProperty("road_address_name")
        String roadAddressName,
        @JsonProperty("x")
        String longitude,
        @JsonProperty("y")
        String latitude
) {
}
