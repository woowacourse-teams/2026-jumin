package jumin.domain.parking.dto;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import jumin.domain.parking.entity.ParkingOperationStatus;

public record ParkingDailyOperationResponse(
        String day,
        String status,
        String openTime,
        String closeTime,
        Boolean paid
) {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm");

    public static ParkingDailyOperationResponse from(
            String day,
            ParkingOperationStatus status,
            LocalTime openTime,
            LocalTime closeTime,
            Boolean paid
    ) {
        String statusName = ParkingOperationStatus.UNKNOWN.name();
        if (status != null) {
            statusName = status.name();
        }
        return new ParkingDailyOperationResponse(day, statusName, format(openTime), format(closeTime), paid);
    }

    private static String format(LocalTime time) {
        if (time == null) {
            return null;
        }
        return time.format(TIME_FORMATTER);
    }
}
