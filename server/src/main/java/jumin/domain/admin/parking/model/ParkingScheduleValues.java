package jumin.domain.admin.parking.model;

import java.time.LocalTime;
import jumin.domain.parking.entity.ParkingOperationStatus;

public record ParkingScheduleValues(
        ParkingOperationStatus status,
        LocalTime openTime,
        LocalTime closeTime
) {
}
