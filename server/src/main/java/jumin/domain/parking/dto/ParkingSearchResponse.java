package jumin.domain.parking.dto;

import java.util.List;

public record ParkingSearchResponse(
        int searchRadiusMeters,
        int totalCount,
        List<ParkingLotResponse> parkingLots
) {
    public ParkingSearchResponse {
        parkingLots = List.copyOf(parkingLots);
    }

    public static ParkingSearchResponse from(int searchRadiusMeters, List<ParkingLotResponse> parkingLots) {
        return new ParkingSearchResponse(
                searchRadiusMeters,
                parkingLots.size(),
                parkingLots
        );
    }
}
