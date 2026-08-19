package jumin.domain.parking.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import jumin.domain.parking.entity.ParkingOperation;
import jumin.domain.parking.entity.ParkingOperationStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class ParkingOperationEvaluatorTest {

    private final ParkingOperationEvaluator evaluator = new ParkingOperationEvaluator();

    @Test
    @DisplayName("평일 운영시간 안의 요청은 이용 가능으로 판단한다")
    void returns_available_within_weekday_schedule() {
        ParkingOperation operation = operationWithWeekday(
                ParkingOperationStatus.OPEN,
                LocalTime.of(9, 0),
                LocalTime.of(18, 0)
        );

        ParkingAvailabilityStatus result = evaluate(
                operation,
                "2026-08-17T10:00:00+09:00",
                "2026-08-17T11:00:00+09:00"
        );

        assertThat(result).isEqualTo(ParkingAvailabilityStatus.AVAILABLE);
    }

    @Test
    @DisplayName("평일 운영시간 밖의 요청은 이용 불가로 판단한다")
    void returns_unavailable_outside_weekday_schedule() {
        ParkingOperation operation = operationWithWeekday(
                ParkingOperationStatus.OPEN,
                LocalTime.of(9, 0),
                LocalTime.of(18, 0)
        );
        setHoliday(operation, ParkingOperationStatus.CLOSED, null, null);

        ParkingAvailabilityStatus result = evaluate(
                operation,
                "2026-08-17T18:00:00+09:00",
                "2026-08-17T19:00:00+09:00"
        );

        assertThat(result).isEqualTo(ParkingAvailabilityStatus.UNAVAILABLE);
    }

    @Test
    @DisplayName("토요일에는 주말, 일요일에는 공휴일 운영시간을 적용한다")
    void applies_weekend_schedule_to_saturday_and_holiday_schedule_to_sunday() {
        ParkingOperation operation = new ParkingOperation();
        setWeekday(operation, ParkingOperationStatus.CLOSED, null, null);
        setWeekend(operation, ParkingOperationStatus.OPEN, LocalTime.of(10, 0), LocalTime.of(16, 0));
        setHoliday(operation, ParkingOperationStatus.OPEN, LocalTime.of(12, 0), LocalTime.of(14, 0));

        ParkingAvailabilityStatus saturdayResult = evaluate(
                operation,
                "2026-08-22T11:00:00+09:00",
                "2026-08-22T12:00:00+09:00"
        );
        ParkingAvailabilityStatus sundayResult = evaluate(
                operation,
                "2026-08-23T12:30:00+09:00",
                "2026-08-23T13:00:00+09:00"
        );
        ParkingAvailabilityStatus sundayOutsideHolidayHours = evaluate(
                operation,
                "2026-08-23T11:00:00+09:00",
                "2026-08-23T11:30:00+09:00"
        );

        assertThat(saturdayResult).isEqualTo(ParkingAvailabilityStatus.AVAILABLE);
        assertThat(sundayResult).isEqualTo(ParkingAvailabilityStatus.AVAILABLE);
        assertThat(sundayOutsideHolidayHours).isEqualTo(ParkingAvailabilityStatus.UNAVAILABLE);
    }

    @Test
    @DisplayName("OPEN 상태의 00:00부터 00:00까지 일정은 종일 운영으로 판단한다")
    void treats_midnight_to_midnight_schedule_as_all_day() {
        ParkingOperation operation = operationWithWeekday(
                ParkingOperationStatus.OPEN,
                LocalTime.MIDNIGHT,
                LocalTime.MIDNIGHT
        );

        ParkingAvailabilityStatus result = evaluate(
                operation,
                "2026-08-17T00:00:00+09:00",
                "2026-08-17T23:30:00+09:00"
        );

        assertThat(result).isEqualTo(ParkingAvailabilityStatus.AVAILABLE);
    }

    @Test
    @DisplayName("운영시간 정보가 없으면 알 수 없음으로 판단한다")
    void returns_unknown_when_schedule_is_missing() {
        ParkingOperation operation = operationWithWeekday(ParkingOperationStatus.UNKNOWN, null, null);

        ParkingAvailabilityStatus result = evaluate(
                operation,
                "2026-08-17T10:00:00+09:00",
                "2026-08-17T11:00:00+09:00"
        );

        assertThat(result).isEqualTo(ParkingAvailabilityStatus.UNKNOWN);
    }

    @Test
    @DisplayName("자정이 아닌 동일 시각 영업 일정은 알 수 없음으로 판단한다")
    void returns_unknown_for_open_schedule_with_same_non_midnight_times() {
        ParkingOperation operation = operationWithWeekday(
                ParkingOperationStatus.OPEN,
                LocalTime.of(9, 0),
                LocalTime.of(9, 0)
        );

        ParkingAvailabilityStatus result = evaluate(
                operation,
                "2026-08-17T10:00:00+09:00",
                "2026-08-17T10:30:00+09:00"
        );

        assertThat(result).isEqualTo(ParkingAvailabilityStatus.UNKNOWN);
    }

    @Test
    @DisplayName("해석할 수 없는 영업 일정은 알 수 없음으로 판단한다")
    void returns_unknown_for_unparseable_schedule() {
        ParkingOperation operation = operationWithWeekday(ParkingOperationStatus.OPEN, null, null);

        ParkingAvailabilityStatus result = evaluate(
                operation,
                "2026-08-17T10:00:00+09:00",
                "2026-08-17T11:00:00+09:00"
        );

        assertThat(result).isEqualTo(ParkingAvailabilityStatus.UNKNOWN);
    }

    @Test
    @DisplayName("자정을 넘기는 평일 운영시간은 다음 평일에도 적용한다")
    void carries_overnight_weekday_schedule_into_the_following_day() {
        ParkingOperation operation = operationWithWeekday(
                ParkingOperationStatus.OPEN,
                LocalTime.of(20, 0),
                LocalTime.of(2, 0)
        );

        ParkingAvailabilityStatus result = evaluate(
                operation,
                "2026-08-18T01:00:00+09:00",
                "2026-08-18T01:30:00+09:00"
        );

        assertThat(result).isEqualTo(ParkingAvailabilityStatus.AVAILABLE);
    }

    @Test
    @DisplayName("당일 야간 운영의 시작 전에는 이용 불가로 판단한다")
    void does_not_apply_todays_overnight_schedule_before_opening() {
        ParkingOperation operation = operationWithWeekday(
                ParkingOperationStatus.OPEN,
                LocalTime.of(22, 0),
                LocalTime.of(2, 0)
        );
        setHoliday(operation, ParkingOperationStatus.CLOSED, null, null);

        ParkingAvailabilityStatus result = evaluate(
                operation,
                "2026-08-17T01:00:00+09:00",
                "2026-08-17T01:30:00+09:00"
        );

        assertThat(result).isEqualTo(ParkingAvailabilityStatus.UNAVAILABLE);
    }

    @Test
    @DisplayName("자정을 넘기는 운영의 종료 시각 이후에는 이용 불가로 판단한다")
    void returns_unavailable_after_overnight_schedule_ends() {
        ParkingOperation operation = operationWithWeekday(
                ParkingOperationStatus.OPEN,
                LocalTime.of(20, 0),
                LocalTime.of(2, 0)
        );

        ParkingAvailabilityStatus result = evaluate(
                operation,
                "2026-08-18T02:30:00+09:00",
                "2026-08-18T03:00:00+09:00"
        );

        assertThat(result).isEqualTo(ParkingAvailabilityStatus.UNAVAILABLE);
    }

    @Test
    @DisplayName("퇴장 시간이 운영 종료 시각이면 해당 구간까지 이용 가능하다")
    void treats_exit_at_closing_time_as_exclusive_boundary() {
        ParkingOperation operation = operationWithWeekday(
                ParkingOperationStatus.OPEN,
                LocalTime.of(9, 0),
                LocalTime.of(18, 0)
        );

        ParkingAvailabilityStatus result = evaluate(
                operation,
                "2026-08-17T17:00:00+09:00",
                "2026-08-17T18:00:00+09:00"
        );

        assertThat(result).isEqualTo(ParkingAvailabilityStatus.AVAILABLE);
    }

    @Test
    @DisplayName("운영 종료 경계를 지나면 이용 불가로 판단한다")
    void returns_unavailable_after_crossing_close_boundary() {
        ParkingOperation operation = operationWithWeekday(
                ParkingOperationStatus.OPEN,
                LocalTime.of(10, 0),
                LocalTime.of(12, 0)
        );
        setHoliday(operation, ParkingOperationStatus.CLOSED, null, null);

        ParkingAvailabilityStatus result = evaluate(
                operation,
                "2026-08-17T11:00:00+09:00",
                "2026-08-17T13:00:00+09:00"
        );

        assertThat(result).isEqualTo(ParkingAvailabilityStatus.UNAVAILABLE);
    }

    @Test
    @DisplayName("평일에서 주말로 넘어가는 전체 구간의 운영 가능 여부를 확인한다")
    void evaluates_weekday_to_weekend_interval() {
        ParkingOperation operation = operationWithWeekday(
                ParkingOperationStatus.OPEN,
                LocalTime.MIDNIGHT,
                LocalTime.MIDNIGHT
        );
        setWeekend(operation, ParkingOperationStatus.CLOSED, null, null);

        ParkingAvailabilityStatus result = evaluate(
                operation,
                "2026-08-21T23:30:00+09:00",
                "2026-08-22T00:30:00+09:00"
        );

        assertThat(result).isEqualTo(ParkingAvailabilityStatus.UNAVAILABLE);
    }

    @Test
    @DisplayName("전날 운영시간이 미상이고 당일이 닫힘이면 알 수 없음으로 판단한다")
    void returns_unknown_when_previous_schedule_may_be_overnight() {
        ParkingOperation operation = operationWithWeekday(ParkingOperationStatus.UNKNOWN, null, null);
        setWeekend(operation, ParkingOperationStatus.CLOSED, null, null);

        ParkingAvailabilityStatus result = evaluate(
                operation,
                "2026-08-22T01:00:00+09:00",
                "2026-08-22T01:30:00+09:00"
        );

        assertThat(result).isEqualTo(ParkingAvailabilityStatus.UNKNOWN);
    }

    @Test
    @DisplayName("잘못된 평가 입력은 알 수 없음으로 반환한다")
    void returns_unknown_for_invalid_input() {
        OffsetDateTime entryAt = OffsetDateTime.parse("2026-08-17T10:00:00+09:00");
        OffsetDateTime exitAt = OffsetDateTime.parse("2026-08-17T11:00:00+09:00");

        assertThat(evaluator.evaluate(null, entryAt, exitAt)).isEqualTo(ParkingAvailabilityStatus.UNKNOWN);
        assertThat(evaluator.evaluate(new ParkingOperation(), null, exitAt))
                .isEqualTo(ParkingAvailabilityStatus.UNKNOWN);
        assertThat(evaluator.evaluate(new ParkingOperation(), entryAt, null))
                .isEqualTo(ParkingAvailabilityStatus.UNKNOWN);
        assertThat(evaluator.evaluate(new ParkingOperation(), exitAt, entryAt))
                .isEqualTo(ParkingAvailabilityStatus.UNKNOWN);
    }

    @Test
    @DisplayName("표현 가능한 마지막 날짜도 날짜 경계 오버플로 없이 평가한다")
    void evaluates_maximum_date_without_overflow() {
        OffsetDateTime entryAt = LocalDate.MAX.atTime(23, 30).atOffset(ZoneOffset.ofHours(9));
        OffsetDateTime exitAt = entryAt.plusMinutes(10);
        ParkingOperation operation = new ParkingOperation();
        switch (entryAt.getDayOfWeek()) {
            case MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY ->
                    setWeekday(operation, ParkingOperationStatus.OPEN, LocalTime.of(20, 0), LocalTime.of(2, 0));
            case SATURDAY ->
                    setWeekend(operation, ParkingOperationStatus.OPEN, LocalTime.of(20, 0), LocalTime.of(2, 0));
            case SUNDAY ->
                    setHoliday(operation, ParkingOperationStatus.OPEN, LocalTime.of(20, 0), LocalTime.of(2, 0));
        }

        ParkingAvailabilityStatus result = evaluator.evaluate(operation, entryAt, exitAt);

        assertThat(result).isEqualTo(ParkingAvailabilityStatus.AVAILABLE);
    }

    private ParkingAvailabilityStatus evaluate(ParkingOperation operation, String entryAt, String exitAt) {
        return evaluator.evaluate(operation, OffsetDateTime.parse(entryAt), OffsetDateTime.parse(exitAt));
    }

    private ParkingOperation operationWithWeekday(
            ParkingOperationStatus status,
            LocalTime openTime,
            LocalTime closeTime
    ) {
        ParkingOperation operation = new ParkingOperation();
        setWeekday(operation, status, openTime, closeTime);
        return operation;
    }

    private void setWeekday(
            ParkingOperation operation,
            ParkingOperationStatus status,
            LocalTime openTime,
            LocalTime closeTime
    ) {
        ReflectionTestUtils.setField(operation, "weekdayStatus", status);
        ReflectionTestUtils.setField(operation, "weekdayOpenTime", openTime);
        ReflectionTestUtils.setField(operation, "weekdayCloseTime", closeTime);
    }

    private void setWeekend(
            ParkingOperation operation,
            ParkingOperationStatus status,
            LocalTime openTime,
            LocalTime closeTime
    ) {
        ReflectionTestUtils.setField(operation, "weekendStatus", status);
        ReflectionTestUtils.setField(operation, "weekendOpenTime", openTime);
        ReflectionTestUtils.setField(operation, "weekendCloseTime", closeTime);
    }

    private void setHoliday(
            ParkingOperation operation,
            ParkingOperationStatus status,
            LocalTime openTime,
            LocalTime closeTime
    ) {
        ReflectionTestUtils.setField(operation, "holidayStatus", status);
        ReflectionTestUtils.setField(operation, "holidayOpenTime", openTime);
        ReflectionTestUtils.setField(operation, "holidayCloseTime", closeTime);
    }
}
