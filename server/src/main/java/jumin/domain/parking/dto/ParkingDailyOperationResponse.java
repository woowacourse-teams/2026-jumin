package jumin.domain.parking.dto;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

public record ParkingDailyOperationResponse(
        String day,
        String openTime,
        String closeTime
) {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm");

    public static ParkingDailyOperationResponse from(
            String day,
            LocalTime openTime,
            LocalTime closeTime
    ) {
        return new ParkingDailyOperationResponse(day, format(openTime), format(closeTime));
    }

    private static String format(LocalTime time) {
        if (time == null) {
            return null;
        }
        return time.format(TIME_FORMATTER);
    }
}
