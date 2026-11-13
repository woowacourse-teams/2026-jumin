package jumin.domain.parking.dto;

import jumin.domain.parking.model.ViewportItem;

public record ParkingLotViewportResponse(
        Long id,
        double latitude,
        double longitude,
        double score,
        boolean likedByMe
) {

    public ParkingLotViewportResponse(Long id, double latitude, double longitude, double score) {
        this(id, latitude, longitude, score, false);
    }

    public static ParkingLotViewportResponse from(ViewportItem item, double score) {
        return new ParkingLotViewportResponse(
                item.id(),
                item.latitude(),
                item.longitude(),
                score
        );
    }
}
