package jumin.domain.parking.dto;

import java.util.List;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parking.entity.ParkingOperation;

public record ParkingLotViewportDetailResponse(
        Long id,
        String name,
        String address,
        Integer capacity,
        ParkingFeeRuleResponse feeRule,
        List<ParkingDailyOperationResponse> dailyOperations
) {

    public static ParkingLotViewportDetailResponse from(
            ParkingLot parkingLot,
            ParkingOperation operation
    ) {
        return new ParkingLotViewportDetailResponse(
                parkingLot.getId(),
                parkingLot.getName(),
                parkingLot.getAddress(),
                parkingLot.getCapacity(),
                ParkingFeeRuleResponse.from(operation),
                dailyOperations(operation)
        );
    }

    private static List<ParkingDailyOperationResponse> dailyOperations(ParkingOperation operation) {
        if (operation == null) {
            return List.of(
                    ParkingDailyOperationResponse.from("WEEKDAY", null, null),
                    ParkingDailyOperationResponse.from("SATURDAY", null, null),
                    ParkingDailyOperationResponse.from("HOLIDAY", null, null)
            );
        }

        return List.of(
                ParkingDailyOperationResponse.from(
                        "WEEKDAY",
                        operation.getWeekdayOpenTime(),
                        operation.getWeekdayCloseTime()
                ),
                ParkingDailyOperationResponse.from(
                        "SATURDAY",
                        operation.getWeekendOpenTime(),
                        operation.getWeekendCloseTime()
                ),
                ParkingDailyOperationResponse.from(
                        "HOLIDAY",
                        operation.getHolidayOpenTime(),
                        operation.getHolidayCloseTime()
                )
        );
    }
}
