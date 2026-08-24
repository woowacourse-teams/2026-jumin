package jumin.domain.parking.dto;

import jumin.domain.parking.entity.ParkingOperation;
import jumin.domain.parking.service.ParkingAvailabilityStatus;

public record ParkingOperationResponse(
        String availabilityStatus,
        ParkingScheduleResponse weekday,
        ParkingScheduleResponse weekend,
        ParkingScheduleResponse holiday
) {

    public static ParkingOperationResponse from(
            ParkingOperation operation,
            ParkingAvailabilityStatus availabilityStatus
    ) {
        if (operation == null) {
            return new ParkingOperationResponse(
                    ParkingAvailabilityStatus.UNKNOWN.name(),
                    ParkingScheduleResponse.unknown(),
                    ParkingScheduleResponse.unknown(),
                    ParkingScheduleResponse.unknown()
            );
        }

        return new ParkingOperationResponse(
                availabilityStatus.name(),
                ParkingScheduleResponse.from(
                        operation.getWeekdayStatus(),
                        operation.getWeekdayOpenTime(),
                        operation.getWeekdayCloseTime(),
                        operation.getWeekdayPaid()
                ),
                ParkingScheduleResponse.from(
                        operation.getWeekendStatus(),
                        operation.getWeekendOpenTime(),
                        operation.getWeekendCloseTime(),
                        operation.getSaturdayPaid()
                ),
                ParkingScheduleResponse.from(
                        operation.getHolidayStatus(),
                        operation.getHolidayOpenTime(),
                        operation.getHolidayCloseTime(),
                        operation.getHolidayPaid()
                )
        );
    }
}
