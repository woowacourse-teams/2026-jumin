package jumin.domain.admin.parking.model;

import java.time.Instant;

public record ParkingOperationValues(
        Integer baseFreeMinutes,
        Integer baseMinutes,
        Integer baseFee,
        Integer additionalMinutes,
        Integer additionalFee,
        Integer dailyMaxFee,
        Integer monthlyFee,
        Boolean weekdayPaid,
        Boolean saturdayPaid,
        Boolean holidayPaid,
        ParkingScheduleValues weekday,
        ParkingScheduleValues weekend,
        ParkingScheduleValues holiday,
        Instant sourceCheckedAt
) {
}
