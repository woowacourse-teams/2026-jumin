package jumin.domain.destination.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record LocalSearchResponse(
        @JsonProperty("documents")
        List<LocalSearchPlace> places
) {

    public LocalSearchResponse {
        if (places != null) {
            places = List.copyOf(places);
        }
    }
}
