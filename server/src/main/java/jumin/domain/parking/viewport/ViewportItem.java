package jumin.domain.parking.viewport;

import java.time.DayOfWeek;
import jumin.domain.parking.dto.ParkingLotViewportRequest;

public record ViewportItem(long id, double latitude, double longitude, Integer capacity,
                           Boolean mechanical, Boolean isPublic, Boolean weekdayPaid,
                           Boolean saturdayPaid, Boolean holidayPaid) {

    public ViewportItem {
        if (!Double.isFinite(latitude) || !Double.isFinite(longitude)
                || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            throw new IllegalArgumentException("캐시 주차장 좌표가 유효하지 않습니다.");
        }
    }

    public boolean matches(ViewportBounds bounds, ParkingLotViewportRequest request, DayOfWeek day) {
        return bounds.contains(latitude, longitude)
                && (!request.freeOnly() || Boolean.FALSE.equals(paidOn(day)))
                && (!request.excludeMechanical() || Boolean.FALSE.equals(mechanical));
    }

    private Boolean paidOn(DayOfWeek day) {
        return switch (day) {
            case SATURDAY -> saturdayPaid;
            case SUNDAY -> holidayPaid;
            default -> weekdayPaid;
        };
    }
}
