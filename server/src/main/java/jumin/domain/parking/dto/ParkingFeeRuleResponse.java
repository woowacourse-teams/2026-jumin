package jumin.domain.parking.dto;

import jumin.domain.parking.entity.ParkingOperation;

public record ParkingFeeRuleResponse(
        Integer baseFreeMinutes,
        Integer baseMinutes,
        Integer baseFee,
        Integer additionalMinutes,
        Integer additionalFee,
        Integer dailyMaxFee
) {

    public static ParkingFeeRuleResponse from(ParkingOperation operation) {
        if (operation == null) {
            return null;
        }

        return new ParkingFeeRuleResponse(
                operation.getBaseFreeMinutes(),
                operation.getBaseMinutes(),
                operation.getBaseFee(),
                operation.getAdditionalMinutes(),
                operation.getAdditionalFee(),
                operation.getDailyMaxFee()
        );
    }
}
