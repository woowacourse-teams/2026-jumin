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
                List.of(
                        ParkingDailyOperationResponse.from(
                                "WEEKDAY",
                                operation == null ? null : operation.getWeekdayOpenTime(),
                                operation == null ? null : operation.getWeekdayCloseTime()
                        ),
                        ParkingDailyOperationResponse.from(
                                "SATURDAY",
                                operation == null ? null : operation.getWeekendOpenTime(),
                                operation == null ? null : operation.getWeekendCloseTime()
                        ),
                        ParkingDailyOperationResponse.from(
                                "HOLIDAY",
                                operation == null ? null : operation.getHolidayOpenTime(),
                                operation == null ? null : operation.getHolidayCloseTime()
                        )
                )
        );
    }
}
