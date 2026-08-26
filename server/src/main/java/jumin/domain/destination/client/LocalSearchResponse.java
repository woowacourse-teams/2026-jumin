package jumin.domain.destination.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record LocalSearchResponse(
        List<LocalSearchPlace> items
) {

    public LocalSearchResponse(List<LocalSearchPlace> items) {
        if (items == null) {
            this.items = List.of();
        } else {
            this.items = List.copyOf(items);
        }
    }
}
