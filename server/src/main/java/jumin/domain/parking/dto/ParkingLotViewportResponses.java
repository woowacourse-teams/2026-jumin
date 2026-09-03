package jumin.domain.parking.dto;

import java.util.List;

public record ParkingLotViewportResponses(
        int totalCount,
        List<ParkingLotViewportResponse> parkingLots
) {
    public ParkingLotViewportResponses {
        parkingLots = List.copyOf(parkingLots);
    }

    public static ParkingLotViewportResponses from(List<ParkingLotViewportResponse> parkingLots) {
        return new ParkingLotViewportResponses(parkingLots.size(), parkingLots);
    }
}
