package jumin.domain.parking.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class ParkingOperationTest {

    @Test
    @DisplayName("요청한 이용 시간에 따른 총 요금을 계산한다")
    void calculates_total_fee_for_the_requested_duration() {
        // given
        ParkingOperation operation = operation(30, 1_000, 10, 500, null);

        // when
        Optional<Integer> result = operation.calculateFee(65);

        // then
        assertThat(result).hasValue(3_000);
    }

    @Test
    @DisplayName("일일 최대 요금을 적용한다")
    void applies_daily_maximum_fee() {
        // given
        ParkingOperation operation = operation(30, 1_000, 10, 500, 2_000);

        // when
        Optional<Integer> result = operation.calculateFee(120);

        // then
        assertThat(result).hasValue(2_000);
    }

    @Test
    @DisplayName("요금이 0원이면 무료로 처리한다")
    void treats_zero_fee_as_free() {
        // given
        ParkingOperation operation = operation(0, 0, 0, 0, 0);

        // when
        Optional<Integer> result = operation.calculateFee(120);

        // then
        assertThat(result).hasValue(0);
    }

    @Test
    @DisplayName("요금 규칙을 계산할 수 없으면 빈 결과를 반환한다")
    void returns_empty_when_fee_rule_cannot_be_calculated() {
        // given
        ParkingOperation missingRule = operation(null, null, null, null, null);
        ParkingOperation invalidAdditionalUnit = operation(30, 1_000, 0, 500, null);

        // when
        Optional<Integer> missingRuleResult = missingRule.calculateFee(60);
        Optional<Integer> invalidAdditionalUnitResult = invalidAdditionalUnit.calculateFee(60);

        // then
        assertThat(missingRuleResult).isEmpty();
        assertThat(invalidAdditionalUnitResult).isEmpty();
    }

    @Test
    @DisplayName("이용 시간이 0분 이하면 빈 결과를 반환한다")
    void returns_empty_for_non_positive_duration() {
        // given
        ParkingOperation operation = operation(30, 1_000, 10, 500, null);

        // when
        Optional<Integer> zeroMinuteResult = operation.calculateFee(0);
        Optional<Integer> negativeMinuteResult = operation.calculateFee(-1);

        // then
        assertThat(zeroMinuteResult).isEmpty();
        assertThat(negativeMinuteResult).isEmpty();
    }

    @Test
    @DisplayName("이용 시간이 기본 시간과 같으면 기본 요금을 반환한다")
    void returns_base_fee_at_base_duration() {
        // given
        ParkingOperation operation = operation(30, 1_000, 0, 500, null);

        // when
        Optional<Integer> result = operation.calculateFee(30);

        // then
        assertThat(result).hasValue(1_000);
    }

    @Test
    @DisplayName("이용 시간이 기본 시간보다 짧으면 기본 요금을 반환한다")
    void returns_base_fee_before_base_duration() {
        // given
        ParkingOperation operation = operation(30, 1_000, 10, 500, null);

        // when
        Optional<Integer> result = operation.calculateFee(10);

        // then
        assertThat(result).hasValue(1_000);
    }

    @Test
    @DisplayName("추가 요금 단위는 부족한 시간도 한 단위로 올림한다")
    void rounds_up_partial_additional_unit() {
        // given
        ParkingOperation operation = operation(30, 1_000, 10, 500, null);

        // when
        Optional<Integer> exactUnitResult = operation.calculateFee(50);
        Optional<Integer> partialUnitResult = operation.calculateFee(51);

        // then
        assertThat(exactUnitResult).hasValue(2_000);
        assertThat(partialUnitResult).hasValue(2_500);
    }

    @Test
    @DisplayName("일일 최대 요금이 기본 요금보다 작으면 기본 요금에도 상한을 적용한다")
    void applies_daily_maximum_below_base_fee() {
        // given
        ParkingOperation operation = operation(30, 1_000, 10, 500, 500);

        // when
        Optional<Integer> result = operation.calculateFee(10);

        // then
        assertThat(result).hasValue(500);
    }

    @Test
    @DisplayName("음수 요금 규칙은 빈 결과를 반환한다")
    void returns_empty_for_negative_fee_rules() {
        // given
        ParkingOperation negativeBaseMinutes = operation(-1, 1_000, 10, 500, null);
        ParkingOperation negativeBaseFee = operation(30, -1, 10, 500, null);
        ParkingOperation negativeAdditionalFee = operation(30, 1_000, 10, -1, null);

        // when
        Optional<Integer> negativeBaseMinutesResult = negativeBaseMinutes.calculateFee(60);
        Optional<Integer> negativeBaseFeeResult = negativeBaseFee.calculateFee(60);
        Optional<Integer> negativeAdditionalFeeResult = negativeAdditionalFee.calculateFee(60);

        // then
        assertThat(negativeBaseMinutesResult).isEmpty();
        assertThat(negativeBaseFeeResult).isEmpty();
        assertThat(negativeAdditionalFeeResult).isEmpty();
    }

    @Test
    @DisplayName("정수 범위를 넘는 요금은 빈 결과를 반환한다")
    void returns_empty_when_fee_exceeds_integer_range() {
        // given
        ParkingOperation operation = operation(Integer.MAX_VALUE - 1, Integer.MAX_VALUE, 1, 1, null);

        // when
        Optional<Integer> result = operation.calculateFee(Integer.MAX_VALUE);

        // then
        assertThat(result).isEmpty();
    }

    private ParkingOperation operation(
            Integer baseMinutes,
            Integer baseFee,
            Integer additionalMinutes,
            Integer additionalFee,
            Integer dailyMaxFee
    ) {
        ParkingOperation operation = new ParkingOperation();
        ReflectionTestUtils.setField(operation, "baseMinutes", baseMinutes);
        ReflectionTestUtils.setField(operation, "baseFee", baseFee);
        ReflectionTestUtils.setField(operation, "additionalMinutes", additionalMinutes);
        ReflectionTestUtils.setField(operation, "additionalFee", additionalFee);
        ReflectionTestUtils.setField(operation, "dailyMaxFee", dailyMaxFee);
        return operation;
    }
}
