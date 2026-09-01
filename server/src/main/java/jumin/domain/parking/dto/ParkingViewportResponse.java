package jumin.domain.parking.dto;

import java.util.List;

public record ParkingViewportResponse(
        int totalCount,
        List<ParkingViewportLotResponse> parkingLots
) {
    public ParkingViewportResponse {
        parkingLots = List.copyOf(parkingLots);
    }

    public static ParkingViewportResponse from(List<ParkingViewportLotResponse> parkingLots) {
        return new ParkingViewportResponse(parkingLots.size(), parkingLots);
    }
}
