package jumin.domain.parking.dto;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import jumin.domain.parking.entity.ParkingOperation;
import jumin.domain.parking.entity.ParkingOperationStatus;
import jumin.domain.parking.service.ParkingAvailabilityStatus;

public record ParkingLotDetailResponse(
        Long id,
        String name,
        String address,
        LocationResponse location,
        Integer capacity,
        Integer distanceMeters,
        Integer estimatedFee,
        String feeCalculationStatus,
        FeeRuleResponse feeRule,
        OperationResponse operation
) {

    public static ParkingLotDetailResponse from(
            Long id,
            String name,
            String address,
            double latitude,
            double longitude,
            Integer capacity,
            int distanceMeters,
            Integer estimatedFee,
            ParkingOperation parkingOperation,
            ParkingAvailabilityStatus availabilityStatus
    ) {
        return new ParkingLotDetailResponse(
                id,
                name,
                address,
                new LocationResponse(latitude, longitude),
                capacity,
                distanceMeters,
                estimatedFee,
                feeCalculationStatusOf(estimatedFee),
                FeeRuleResponse.from(parkingOperation),
                OperationResponse.from(parkingOperation, availabilityStatus)
        );
    }

    private static String feeCalculationStatusOf(Integer estimatedFee) {
        if (estimatedFee == null) {
            return "UNAVAILABLE";
        }
        return "CALCULATED";
    }

    public record FeeRuleResponse(
            Integer baseFreeMinutes,
            Integer baseMinutes,
            Integer baseFee,
            Integer additionalMinutes,
            Integer additionalFee,
            Integer dailyMaxFee
    ) {

        private static FeeRuleResponse from(ParkingOperation operation) {
            if (operation == null) {
                return null;
            }

            return new FeeRuleResponse(
                    operation.getBaseFreeMinutes(),
                    operation.getBaseMinutes(),
                    operation.getBaseFee(),
                    operation.getAdditionalMinutes(),
                    operation.getAdditionalFee(),
                    operation.getDailyMaxFee()
            );
        }
    }

    public record OperationResponse(
            String availabilityStatus,
            ScheduleResponse weekday,
            ScheduleResponse weekend,
            ScheduleResponse holiday
    ) {

        private static OperationResponse from(
                ParkingOperation operation,
                ParkingAvailabilityStatus availabilityStatus
        ) {
            if (operation == null) {
                return new OperationResponse(
                        ParkingAvailabilityStatus.UNKNOWN.name(),
                        ScheduleResponse.unknown(),
                        ScheduleResponse.unknown(),
                        ScheduleResponse.unknown()
                );
            }

            return new OperationResponse(
                    availabilityStatus.name(),
                    ScheduleResponse.from(
                            operation.getWeekdayStatus(),
                            operation.getWeekdayOpenTime(),
                            operation.getWeekdayCloseTime(),
                            operation.getWeekdayPaid()
                    ),
                    ScheduleResponse.from(
                            operation.getWeekendStatus(),
                            operation.getWeekendOpenTime(),
                            operation.getWeekendCloseTime(),
                            operation.getSaturdayPaid()
                    ),
                    ScheduleResponse.from(
                            operation.getHolidayStatus(),
                            operation.getHolidayOpenTime(),
                            operation.getHolidayCloseTime(),
                            operation.getHolidayPaid()
                    )
            );
        }
    }

    public record ScheduleResponse(
            String status,
            String openTime,
            String closeTime,
            Boolean paid
    ) {

        private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm");

        private static ScheduleResponse from(
                ParkingOperationStatus status,
                LocalTime openTime,
                LocalTime closeTime,
                Boolean paid
        ) {
            String statusName = status == null ? ParkingOperationStatus.UNKNOWN.name() : status.name();
            return new ScheduleResponse(statusName, format(openTime), format(closeTime), paid);
        }

        private static ScheduleResponse unknown() {
            return new ScheduleResponse(ParkingOperationStatus.UNKNOWN.name(), null, null, null);
        }

        private static String format(LocalTime time) {
            if (time == null) {
                return null;
            }
            return time.format(TIME_FORMATTER);
        }
    }
}
