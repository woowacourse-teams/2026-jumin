package jumin.domain.parking.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.DayOfWeek;
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
        Integer result = operation.calculateFee(65, DayOfWeek.MONDAY);

        // then
        assertThat(result).isEqualTo(3_000);
    }

    @Test
    @DisplayName("일일 최대 요금을 적용한다")
    void applies_daily_maximum_fee() {
        // given
        ParkingOperation operation = operation(30, 1_000, 10, 500, 2_000);

        // when
        Integer result = operation.calculateFee(120, DayOfWeek.MONDAY);

        // then
        assertThat(result).isEqualTo(2_000);
    }

    @Test
    @DisplayName("요금이 0원이면 무료로 처리한다")
    void treats_zero_fee_as_free() {
        // given
        ParkingOperation operation = operation(0, 0, 0, 0, 0);

        // when
        Integer result = operation.calculateFee(120, DayOfWeek.MONDAY);

        // then
        assertThat(result).isZero();
    }

    @Test
    @DisplayName("요금 규칙을 계산할 수 없으면 빈 결과를 반환한다")
    void returns_empty_when_fee_rule_cannot_be_calculated() {
        // given
        ParkingOperation missingRule = operation(null, null, null, null, null);
        ParkingOperation invalidAdditionalUnit = operation(30, 1_000, 0, 500, null);

        // when
        Integer missingRuleResult = missingRule.calculateFee(60, DayOfWeek.MONDAY);
        Integer invalidAdditionalUnitResult = invalidAdditionalUnit.calculateFee(60, DayOfWeek.MONDAY);

        // then
        assertThat(missingRuleResult).isNull();
        assertThat(invalidAdditionalUnitResult).isNull();
    }

    @Test
    @DisplayName("이용 시간이 0분 이하면 빈 결과를 반환한다")
    void returns_empty_for_non_positive_duration() {
        // given
        ParkingOperation operation = operation(30, 1_000, 10, 500, null);

        // when
        Integer zeroMinuteResult = operation.calculateFee(0, DayOfWeek.MONDAY);
        Integer negativeMinuteResult = operation.calculateFee(-1, DayOfWeek.MONDAY);

        // then
        assertThat(zeroMinuteResult).isNull();
        assertThat(negativeMinuteResult).isNull();
    }

    @Test
    @DisplayName("이용 시간이 기본 시간과 같으면 기본 요금을 반환한다")
    void returns_base_fee_at_base_duration() {
        // given
        ParkingOperation operation = operation(30, 1_000, 0, 500, null);

        // when
        Integer result = operation.calculateFee(30, DayOfWeek.MONDAY);

        // then
        assertThat(result).isEqualTo(1_000);
    }

    @Test
    @DisplayName("이용 시간이 기본 시간보다 짧으면 기본 요금을 반환한다")
    void returns_base_fee_before_base_duration() {
        // given
        ParkingOperation operation = operation(30, 1_000, 10, 500, null);

        // when
        Integer result = operation.calculateFee(10, DayOfWeek.MONDAY);

        // then
        assertThat(result).isEqualTo(1_000);
    }

    @Test
    @DisplayName("기본 무료시간 이내에는 0원으로 계산한다")
    void returns_zero_fee_within_base_free_duration() {
        // given
        ParkingOperation operation = operation(30, 1_000, 10, 500, null);
        ReflectionTestUtils.setField(operation, "baseFreeMinutes", 30);

        // when
        Integer result = operation.calculateFee(30, DayOfWeek.MONDAY);

        // then
        assertThat(result).isZero();
    }

    @Test
    @DisplayName("기본 무료시간을 초과하면 기본요금을 계산한다")
    void returns_base_fee_after_base_free_duration() {
        // given
        ParkingOperation operation = operation(30, 1_000, 10, 500, null);
        ReflectionTestUtils.setField(operation, "baseFreeMinutes", 30);

        // when
        Integer result = operation.calculateFee(31, DayOfWeek.MONDAY);

        // then
        assertThat(result).isEqualTo(1_000);
    }

    @Test
    @DisplayName("무료시간을 제외한 유료시간 기준으로 추가요금을 계산한다")
    void calculates_additional_fee_from_paid_duration() {
        // given
        ParkingOperation operation = operation(30, 1_000, 10, 500, null);
        ReflectionTestUtils.setField(operation, "baseFreeMinutes", 30);

        // when
        Integer baseFeeResult = operation.calculateFee(60, DayOfWeek.MONDAY);
        Integer additionalFeeResult = operation.calculateFee(61, DayOfWeek.MONDAY);

        // then
        assertThat(baseFeeResult).isEqualTo(1_000);
        assertThat(additionalFeeResult).isEqualTo(1_500);
    }

    @Test
    @DisplayName("추가 요금 단위는 부족한 시간도 한 단위로 올림한다")
    void rounds_up_partial_additional_unit() {
        // given
        ParkingOperation operation = operation(30, 1_000, 10, 500, null);

        // when
        Integer exactUnitResult = operation.calculateFee(50, DayOfWeek.MONDAY);
        Integer partialUnitResult = operation.calculateFee(51, DayOfWeek.MONDAY);

        // then
        assertThat(exactUnitResult).isEqualTo(2_000);
        assertThat(partialUnitResult).isEqualTo(2_500);
    }

    @Test
    @DisplayName("일일 최대 요금이 기본 요금보다 작으면 기본 요금에도 상한을 적용한다")
    void applies_daily_maximum_below_base_fee() {
        // given
        ParkingOperation operation = operation(30, 1_000, 10, 500, 500);

        // when
        Integer result = operation.calculateFee(10, DayOfWeek.MONDAY);

        // then
        assertThat(result).isEqualTo(500);
    }

    @Test
    @DisplayName("음수 요금 규칙은 빈 결과를 반환한다")
    void returns_empty_for_negative_fee_rules() {
        // given
        ParkingOperation negativeBaseMinutes = operation(-1, 1_000, 10, 500, null);
        ParkingOperation negativeBaseFee = operation(30, -1, 10, 500, null);
        ParkingOperation negativeAdditionalFee = operation(30, 1_000, 10, -1, null);
        ParkingOperation negativeBaseFreeMinutes = operation(30, 1_000, 10, 500, null);
        ReflectionTestUtils.setField(negativeBaseFreeMinutes, "baseFreeMinutes", -1);

        // when
        Integer negativeBaseMinutesResult = negativeBaseMinutes.calculateFee(60, DayOfWeek.MONDAY);
        Integer negativeBaseFeeResult = negativeBaseFee.calculateFee(60, DayOfWeek.MONDAY);
        Integer negativeAdditionalFeeResult = negativeAdditionalFee.calculateFee(60, DayOfWeek.MONDAY);
        Integer negativeBaseFreeMinutesResult = negativeBaseFreeMinutes.calculateFee(60, DayOfWeek.MONDAY);

        // then
        assertThat(negativeBaseMinutesResult).isNull();
        assertThat(negativeBaseFeeResult).isNull();
        assertThat(negativeAdditionalFeeResult).isNull();
        assertThat(negativeBaseFreeMinutesResult).isNull();
    }

    @Test
    @DisplayName("정수 범위를 넘는 요금은 빈 결과를 반환한다")
    void returns_empty_when_fee_exceeds_integer_range() {
        // given
        ParkingOperation operation = operation(Integer.MAX_VALUE - 1, Integer.MAX_VALUE, 1, 1, null);

        // when
        Integer result = operation.calculateFee(Integer.MAX_VALUE, DayOfWeek.MONDAY);

        // then
        assertThat(result).isNull();
    }

    @Test
    @DisplayName("해당 날짜가 무료이면 요금 규칙과 관계없이 0원을 반환한다")
    void returns_zero_when_entry_date_is_free() {
        // given
        ParkingOperation operation = operation(30, 1_000, 10, 500, null);
        ReflectionTestUtils.setField(operation, "weekdayPaid", false);

        // when
        Integer result = operation.calculateFee(60, DayOfWeek.MONDAY);

        // then
        assertThat(result).isZero();
    }

    @Test
    @DisplayName("무료 날짜여도 이용 시간이 올바르지 않으면 빈 결과를 반환한다")
    void returns_empty_for_invalid_duration_on_free_date() {
        // given
        ParkingOperation operation = operation(30, 1_000, 10, 500, null);
        ReflectionTestUtils.setField(operation, "weekdayPaid", false);

        // when
        Integer result = operation.calculateFee(0, DayOfWeek.MONDAY);

        // then
        assertThat(result).isNull();
    }

    @Test
    @DisplayName("해당 날짜의 유료 여부를 알 수 없으면 빈 결과를 반환한다")
    void returns_empty_when_paid_status_is_unknown() {
        // given
        ParkingOperation operation = operation(30, 1_000, 10, 500, null);
        ReflectionTestUtils.setField(operation, "weekdayPaid", null);

        // when
        Integer result = operation.calculateFee(60, DayOfWeek.MONDAY);

        // then
        assertThat(result).isNull();
    }

    @Test
    @DisplayName("토요일이 무료이면 평일 유료 여부와 관계없이 0원을 반환한다")
    void returns_zero_for_saturday_free_status() {
        // given
        ParkingOperation operation = operation(30, 1_000, 10, 500, null);
        ReflectionTestUtils.setField(operation, "saturdayPaid", false);

        // when
        Integer result = operation.calculateFee(60, DayOfWeek.SATURDAY);

        // then
        assertThat(result).isZero();
    }

    @Test
    @DisplayName("일요일·공휴일이 무료이면 평일 유료 여부와 관계없이 0원을 반환한다")
    void returns_zero_for_holiday_free_status() {
        // given
        ParkingOperation operation = operation(30, 1_000, 10, 500, null);
        ReflectionTestUtils.setField(operation, "holidayPaid", false);

        // when
        Integer result = operation.calculateFee(60, DayOfWeek.SUNDAY);

        // then
        assertThat(result).isZero();
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
        ReflectionTestUtils.setField(operation, "weekdayPaid", true);
        return operation;
    }
}
