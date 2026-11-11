package jumin.domain.destination.dto;

import java.util.List;

public record DestinationsResponse(
        String query,
        List<DestinationResponse> destinations,
        List<ParkingLotSearchResponse> parkingLots
) {

    public DestinationsResponse {
        destinations = List.copyOf(destinations);
        parkingLots = List.copyOf(parkingLots);
    }

    public static DestinationsResponse from(
            String query,
            List<DestinationResponse> destinations,
            List<ParkingLotSearchResponse> parkingLots
    ) {
        return new DestinationsResponse(query, destinations, parkingLots);
    }
}
