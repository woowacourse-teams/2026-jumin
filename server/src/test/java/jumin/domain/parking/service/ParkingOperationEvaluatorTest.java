package jumin.domain.parking.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalTime;
import java.time.OffsetDateTime;
import jumin.domain.parking.entity.ParkingOperation;
import jumin.domain.parking.entity.ParkingOperationStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.springframework.test.util.ReflectionTestUtils;

class ParkingOperationEvaluatorTest {

    private final ParkingOperationEvaluator evaluator = new ParkingOperationEvaluator();

    @Test
    @DisplayName("자정부터 자정까지인 영업 일정은 종일 운영으로 판단한다")
    void treats_open_midnight_schedule_as_all_day() {
        // given
        ParkingOperation operation = operationForMonday(
                ParkingOperationStatus.OPEN,
                LocalTime.MIDNIGHT,
                LocalTime.MIDNIGHT
        );

        // when
        ParkingAvailabilityStatus result = evaluator.evaluate(
                operation,
                OffsetDateTime.parse("2026-08-17T23:00:00+09:00"),
                OffsetDateTime.parse("2026-08-17T23:30:00+09:00")
        );

        // then
        assertThat(result).isEqualTo(ParkingAvailabilityStatus.AVAILABLE);
    }

    @Test
    @DisplayName("자정이 아닌 동일 시각 영업 일정은 알 수 없음으로 판단한다")
    void returns_unknown_for_open_schedule_with_same_non_midnight_times() {
        // given
        ParkingOperation operation = operationForMonday(
                ParkingOperationStatus.OPEN,
                LocalTime.of(9, 0),
                LocalTime.of(9, 0)
        );
        ReflectionTestUtils.setField(operation, "sundayStatus", ParkingOperationStatus.CLOSED);

        // when
        ParkingAvailabilityStatus result = evaluator.evaluate(
                operation,
                OffsetDateTime.parse("2026-08-17T10:00:00+09:00"),
                OffsetDateTime.parse("2026-08-17T10:30:00+09:00")
        );

        // then
        assertThat(result).isEqualTo(ParkingAvailabilityStatus.UNKNOWN);
    }

    @Test
    @DisplayName("익일로 이어지는 영업 일정을 다음 날에도 적용한다")
    void carries_overnight_schedule_into_the_following_day() {
        // given
        ParkingOperation operation = operationForMonday(
                ParkingOperationStatus.OPEN,
                LocalTime.of(20, 0),
                LocalTime.of(2, 0)
        );

        // when
        ParkingAvailabilityStatus result = evaluator.evaluate(
                operation,
                OffsetDateTime.parse("2026-08-18T01:00:00+09:00"),
                OffsetDateTime.parse("2026-08-18T01:30:00+09:00")
        );

        // then
        assertThat(result).isEqualTo(ParkingAvailabilityStatus.AVAILABLE);
    }

    @Test
    @DisplayName("오늘 일정의 시작 전 시간에는 오늘의 야간 일정을 적용하지 않는다")
    void does_not_apply_todays_overnight_schedule_before_opening() {
        // given
        ParkingOperation operation = operationForMonday(
                ParkingOperationStatus.OPEN,
                LocalTime.of(22, 0),
                LocalTime.of(2, 0)
        );
        ReflectionTestUtils.setField(operation, "sundayStatus", ParkingOperationStatus.CLOSED);

        // when
        ParkingAvailabilityStatus result = evaluator.evaluate(
                operation,
                OffsetDateTime.parse("2026-08-17T01:00:00+09:00"),
                OffsetDateTime.parse("2026-08-17T01:30:00+09:00")
        );

        // then
        assertThat(result).isEqualTo(ParkingAvailabilityStatus.UNAVAILABLE);
    }

    @Test
    @DisplayName("야간 운영 종료 시각부터는 이용 불가로 판단한다")
    void returns_unavailable_after_overnight_schedule_ends() {
        // given
        ParkingOperation operation = operationForMonday(
                ParkingOperationStatus.OPEN,
                LocalTime.of(20, 0),
                LocalTime.of(2, 0)
        );
        ReflectionTestUtils.setField(operation, "tuesdayStatus", ParkingOperationStatus.CLOSED);

        // when
        ParkingAvailabilityStatus result = evaluator.evaluate(
                operation,
                OffsetDateTime.parse("2026-08-18T01:30:00+09:00"),
                OffsetDateTime.parse("2026-08-18T02:30:00+09:00")
        );

        // then
        assertThat(result).isEqualTo(ParkingAvailabilityStatus.UNAVAILABLE);
    }

    @Test
    @DisplayName("퇴장 시간이 영업 종료 시각이면 해당 구간까지 이용 가능하다")
    void treats_exit_at_closing_time_as_exclusive_boundary() {
        // given
        ParkingOperation operation = operationForMonday(
                ParkingOperationStatus.OPEN,
                LocalTime.of(9, 0),
                LocalTime.of(18, 0)
        );
        ReflectionTestUtils.setField(operation, "sundayStatus", ParkingOperationStatus.CLOSED);

        // when
        ParkingAvailabilityStatus result = evaluator.evaluate(
                operation,
                OffsetDateTime.parse("2026-08-17T17:00:00+09:00"),
                OffsetDateTime.parse("2026-08-17T18:00:00+09:00")
        );

        // then
        assertThat(result).isEqualTo(ParkingAvailabilityStatus.AVAILABLE);
    }

    @Test
    @DisplayName("입차 시간이 영업 종료 시각이면 이용 불가하다")
    void rejects_entry_at_closing_time() {
        // given
        ParkingOperation operation = operationForMonday(
                ParkingOperationStatus.OPEN,
                LocalTime.of(9, 0),
                LocalTime.of(18, 0)
        );
        ReflectionTestUtils.setField(operation, "sundayStatus", ParkingOperationStatus.CLOSED);

        // when
        ParkingAvailabilityStatus result = evaluator.evaluate(
                operation,
                OffsetDateTime.parse("2026-08-17T18:00:00+09:00"),
                OffsetDateTime.parse("2026-08-17T19:00:00+09:00")
        );

        // then
        assertThat(result).isEqualTo(ParkingAvailabilityStatus.UNAVAILABLE);
    }

    @Test
    @DisplayName("전날 미상 일정과 당일 닫힘 일정이 겹치면 알 수 없음으로 판단한다")
    void returns_unknown_when_previous_schedule_may_be_overnight() {
        // given
        ParkingOperation operation = operationForMonday(ParkingOperationStatus.UNKNOWN, null, null);
        ReflectionTestUtils.setField(operation, "tuesdayStatus", ParkingOperationStatus.CLOSED);

        // when
        ParkingAvailabilityStatus result = evaluator.evaluate(
                operation,
                OffsetDateTime.parse("2026-08-18T01:00:00+09:00"),
                OffsetDateTime.parse("2026-08-18T01:30:00+09:00")
        );

        // then
        assertThat(result).isEqualTo(ParkingAvailabilityStatus.UNKNOWN);
    }

    @Test
    @DisplayName("해석할 수 없는 영업 일정은 알 수 없음으로 반환한다")
    void returns_unknown_for_unparseable_schedule() {
        // given
        ParkingOperation operation = operationForMonday(ParkingOperationStatus.OPEN, null, null);

        // when
        ParkingAvailabilityStatus result = evaluator.evaluate(
                operation,
                OffsetDateTime.parse("2026-08-17T10:00:00+09:00"),
                OffsetDateTime.parse("2026-08-17T11:00:00+09:00")
        );

        // then
        assertThat(result).isEqualTo(ParkingAvailabilityStatus.UNKNOWN);
    }

    @Test
    @DisplayName("영업 종료 경계를 지나면 이용 불가로 판단한다")
    void returns_unavailable_after_crossing_close_boundary() {
        // given
        ParkingOperation operation = operationForMonday(
                ParkingOperationStatus.OPEN,
                LocalTime.of(10, 0),
                LocalTime.of(12, 0)
        );
        ReflectionTestUtils.setField(operation, "sundayStatus", ParkingOperationStatus.CLOSED);

        // when
        ParkingAvailabilityStatus result = evaluator.evaluate(
                operation,
                OffsetDateTime.parse("2026-08-17T11:00:00+09:00"),
                OffsetDateTime.parse("2026-08-17T13:00:00+09:00")
        );

        // then
        assertThat(result).isEqualTo(ParkingAvailabilityStatus.UNAVAILABLE);
    }

    @Test
    @DisplayName("야간 운영 종료 후 미상 일정이면 알 수 없음으로 판단한다")
    void returns_unknown_after_overnight_schedule_ends() {
        // given
        ParkingOperation operation = operationForMonday(
                ParkingOperationStatus.OPEN,
                LocalTime.of(20, 0),
                LocalTime.of(2, 0)
        );
        ReflectionTestUtils.setField(operation, "tuesdayStatus", ParkingOperationStatus.OPEN);

        // when
        ParkingAvailabilityStatus result = evaluator.evaluate(
                operation,
                OffsetDateTime.parse("2026-08-17T23:00:00+09:00"),
                OffsetDateTime.parse("2026-08-18T03:00:00+09:00")
        );

        // then
        assertThat(result).isEqualTo(ParkingAvailabilityStatus.UNKNOWN);
    }

    @Test
    @DisplayName("잘못된 평가 입력은 알 수 없음으로 반환한다")
    void returns_unknown_for_invalid_input() {
        // given
        OffsetDateTime entryAt = OffsetDateTime.parse("2026-08-17T10:00:00+09:00");
        OffsetDateTime exitAt = OffsetDateTime.parse("2026-08-17T11:00:00+09:00");

        // when & then
        assertThat(evaluator.evaluate(null, entryAt, exitAt)).isEqualTo(ParkingAvailabilityStatus.UNKNOWN);
        assertThat(evaluator.evaluate(new ParkingOperation(), null, exitAt))
                .isEqualTo(ParkingAvailabilityStatus.UNKNOWN);
        assertThat(evaluator.evaluate(new ParkingOperation(), entryAt, null))
                .isEqualTo(ParkingAvailabilityStatus.UNKNOWN);
        assertThat(evaluator.evaluate(new ParkingOperation(), exitAt, entryAt))
                .isEqualTo(ParkingAvailabilityStatus.UNKNOWN);
    }

    @Test
    @DisplayName("정상 영업시간 안의 요청은 이용 가능으로 판단한다")
    void returns_available_within_regular_schedule() {
        // given
        ParkingOperation operation = operationForMonday(
                ParkingOperationStatus.OPEN,
                LocalTime.of(9, 0),
                LocalTime.of(18, 0)
        );

        // when
        ParkingAvailabilityStatus result = evaluator.evaluate(
                operation,
                OffsetDateTime.parse("2026-08-17T10:00:00+09:00"),
                OffsetDateTime.parse("2026-08-17T11:00:00+09:00")
        );

        // then
        assertThat(result).isEqualTo(ParkingAvailabilityStatus.AVAILABLE);
    }

    @Test
    @DisplayName("닫힌 일정은 이용 불가로 판단한다")
    void returns_unavailable_for_closed_schedule() {
        // given
        ParkingOperation operation = operationForMonday(
                ParkingOperationStatus.CLOSED,
                null,
                null
        );
        ReflectionTestUtils.setField(operation, "sundayStatus", ParkingOperationStatus.CLOSED);

        // when
        ParkingAvailabilityStatus result = evaluator.evaluate(
                operation,
                OffsetDateTime.parse("2026-08-17T10:00:00+09:00"),
                OffsetDateTime.parse("2026-08-17T11:00:00+09:00")
        );

        // then
        assertThat(result).isEqualTo(ParkingAvailabilityStatus.UNAVAILABLE);
    }

    @Test
    @DisplayName("종일 운영 일정은 이용 가능으로 판단한다")
    void returns_available_for_all_day_schedule() {
        // given
        ParkingOperation operation = operationForMonday(
                ParkingOperationStatus.ALL_DAY,
                null,
                null
        );

        // when
        ParkingAvailabilityStatus result = evaluator.evaluate(
                operation,
                OffsetDateTime.parse("2026-08-17T00:00:00+09:00"),
                OffsetDateTime.parse("2026-08-17T23:00:00+09:00")
        );

        // then
        assertThat(result).isEqualTo(ParkingAvailabilityStatus.AVAILABLE);
    }

    @Test
    @DisplayName("알 수 없는 운영 상태는 알 수 없음으로 판단한다")
    void returns_unknown_for_unknown_status() {
        // given
        ParkingOperation operation = operationForMonday(
                ParkingOperationStatus.UNKNOWN,
                null,
                null
        );

        // when
        ParkingAvailabilityStatus result = evaluator.evaluate(
                operation,
                OffsetDateTime.parse("2026-08-17T10:00:00+09:00"),
                OffsetDateTime.parse("2026-08-17T11:00:00+09:00")
        );

        // then
        assertThat(result).isEqualTo(ParkingAvailabilityStatus.UNKNOWN);
    }

    private ParkingOperation operationForMonday(
            ParkingOperationStatus status,
            LocalTime openTime,
            LocalTime closeTime
    ) {
        ParkingOperation operation = new ParkingOperation();
        ReflectionTestUtils.setField(operation, "mondayStatus", status);
        ReflectionTestUtils.setField(operation, "mondayOpenTime", openTime);
        ReflectionTestUtils.setField(operation, "mondayCloseTime", closeTime);
        return operation;
    }
}
