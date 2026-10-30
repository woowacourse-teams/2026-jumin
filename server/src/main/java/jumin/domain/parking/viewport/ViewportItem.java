package jumin.domain.parking.viewport;

import java.time.DayOfWeek;
import jumin.domain.parking.dto.ParkingLotViewportRequest;

public record ViewportItem(long id, double latitude, double longitude, Integer capacity,
                           Boolean mechanical, Boolean isPublic, Boolean weekdayPaid,
                           Boolean saturdayPaid, Boolean holidayPaid) {

    public ViewportItem {
        if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
            throw new IllegalArgumentException("캐시 주차장 좌표가 유효하지 않습니다.");
        }
    }

    private static boolean isValidLatitude(double latitude) {
        return Double.isFinite(latitude) && latitude >= -90 && latitude <= 90;
    }

    private static boolean isValidLongitude(double longitude) {
        return Double.isFinite(longitude) && longitude >= -180 && longitude <= 180;
    }

    public boolean matches(ViewportBounds bounds, ParkingLotViewportRequest request, DayOfWeek day) {
        if (!bounds.contains(latitude, longitude)) {
            return false;
        }
        if (request.freeOnly() && !Boolean.FALSE.equals(paidOn(day))) {
            return false;
        }
        if (request.excludeMechanical() && !Boolean.FALSE.equals(mechanical)) {
            return false;
        }
        return !request.isPublic() || Boolean.TRUE.equals(isPublic);
    }

    private Boolean paidOn(DayOfWeek day) {
        return switch (day) {
            case SATURDAY -> saturdayPaid;
            case SUNDAY -> holidayPaid;
            default -> weekdayPaid;
        };
    }
}
