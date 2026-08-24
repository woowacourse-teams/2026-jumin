package jumin.domain.parking.dto;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import jumin.domain.parking.entity.ParkingOperationStatus;

public record ParkingScheduleResponse(
        String status,
        String openTime,
        String closeTime,
        Boolean paid
) {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm");

    public static ParkingScheduleResponse from(
            ParkingOperationStatus status,
            LocalTime openTime,
            LocalTime closeTime,
            Boolean paid
    ) {
        String statusName = ParkingOperationStatus.UNKNOWN.name();
        if (status != null) {
            statusName = status.name();
        }
        return new ParkingScheduleResponse(statusName, format(openTime), format(closeTime), paid);
    }

    public static ParkingScheduleResponse unknown() {
        return new ParkingScheduleResponse(ParkingOperationStatus.UNKNOWN.name(), null, null, null);
    }

    private static String format(LocalTime time) {
        if (time == null) {
            return null;
        }
        return time.format(TIME_FORMATTER);
    }
}
