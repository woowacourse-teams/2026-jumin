package jumin.domain.destination.dto;

import java.util.List;

public record DestinationsResponse(
    String query,
    List<DestinationResponse> destinations
) {

    public DestinationsResponse {
        destinations = List.copyOf(destinations);
    }

    public static DestinationsResponse from(String query, List<DestinationResponse> destinations) {
        return new DestinationsResponse(query, destinations);
    }
}
