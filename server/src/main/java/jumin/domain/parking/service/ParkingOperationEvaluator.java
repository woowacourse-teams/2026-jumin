package jumin.domain.parking.service;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.Optional;
import jumin.domain.parking.entity.ParkingOperation;
import jumin.domain.parking.entity.ParkingOperationStatus;
import org.springframework.stereotype.Component;

@Component
public class ParkingOperationEvaluator {

    public ParkingAvailabilityStatus evaluate(
            ParkingOperation parkingOperation,
            OffsetDateTime entryAt,
            OffsetDateTime exitAt
    ) {
        if (parkingOperation == null || entryAt == null || exitAt == null || !exitAt.isAfter(entryAt)) {
            return ParkingAvailabilityStatus.UNKNOWN;
        }

        boolean hasUnknownPeriod = false;
        for (OffsetDateTime evaluationAt = entryAt;
             evaluationAt.isBefore(exitAt);
             evaluationAt = nextBoundaryAt(parkingOperation, evaluationAt, exitAt)
        ) {
            ParkingAvailabilityStatus statusAtBoundary = evaluateAt(parkingOperation, evaluationAt);
            if (statusAtBoundary == ParkingAvailabilityStatus.UNAVAILABLE) {
                return ParkingAvailabilityStatus.UNAVAILABLE;
            }
            hasUnknownPeriod |= statusAtBoundary == ParkingAvailabilityStatus.UNKNOWN;
        }
        return hasUnknownPeriod ? ParkingAvailabilityStatus.UNKNOWN : ParkingAvailabilityStatus.AVAILABLE;
    }

    private OffsetDateTime nextBoundaryAt(
            ParkingOperation parkingOperation,
            OffsetDateTime evaluationAt,
            OffsetDateTime exitAt
    ) {
        Optional<OffsetDateTime> nextBoundaryAt = Optional.of(nextMidnightAt(evaluationAt));
        Schedule currentDaySchedule = scheduleForDay(parkingOperation, evaluationAt.getDayOfWeek());
        Schedule previousDaySchedule = scheduleForDay(parkingOperation, evaluationAt.minusDays(1).getDayOfWeek());

        nextBoundaryAt = earlierBoundaryAt(nextBoundaryAt, nextCandidateBoundaryAt(evaluationAt, currentDaySchedule));
        nextBoundaryAt = earlierBoundaryAt(nextBoundaryAt, previousOvernightCloseAt(evaluationAt, previousDaySchedule));
        return earlierBoundaryAt(nextBoundaryAt, Optional.of(exitAt)).orElseThrow();
    }

    private Optional<OffsetDateTime> nextCandidateBoundaryAt(OffsetDateTime evaluationAt, Schedule dailySchedule) {
        if (!dailySchedule.isOpen()) {
            return Optional.empty();
        }
        return earlierBoundaryAt(
                nextOccurrenceAt(evaluationAt, dailySchedule.openTime()),
                nextOccurrenceAt(evaluationAt, dailySchedule.closeTime())
        );
    }

    private Optional<OffsetDateTime> previousOvernightCloseAt(
            OffsetDateTime evaluationAt,
            Schedule previousDaySchedule
    ) {
        if (!previousDaySchedule.isOvernight()) {
            return Optional.empty();
        }
        OffsetDateTime closeAt = evaluationAt.toLocalDate()
                .atTime(previousDaySchedule.closeTime())
                .atOffset(evaluationAt.getOffset());
        return Optional.of(closeAt).filter(value -> value.isAfter(evaluationAt));
    }

    private OffsetDateTime nextMidnightAt(OffsetDateTime evaluationAt) {
        return evaluationAt.toLocalDate().plusDays(1).atStartOfDay().atOffset(evaluationAt.getOffset());
    }

    private Optional<OffsetDateTime> nextOccurrenceAt(OffsetDateTime evaluationAt, LocalTime localTime) {
        return Optional.ofNullable(localTime).map(time -> {
            OffsetDateTime occurrenceAt = evaluationAt.toLocalDate()
                    .atTime(time)
                    .atOffset(evaluationAt.getOffset());
            if (!occurrenceAt.isAfter(evaluationAt)) {
                occurrenceAt = occurrenceAt.plusDays(1);
            }
            return occurrenceAt;
        });
    }

    private Optional<OffsetDateTime> earlierBoundaryAt(
            Optional<OffsetDateTime> currentBoundaryAt,
            Optional<OffsetDateTime> candidateBoundaryAt
    ) {
        if (candidateBoundaryAt.isEmpty()
                || (currentBoundaryAt.isPresent()
                && !candidateBoundaryAt.get().isBefore(currentBoundaryAt.get()))) {
            return currentBoundaryAt;
        }
        return candidateBoundaryAt;
    }

    private ParkingAvailabilityStatus evaluateAt(ParkingOperation parkingOperation, OffsetDateTime evaluationAt) {
        Schedule currentDaySchedule = scheduleForDay(parkingOperation, evaluationAt.getDayOfWeek());
        LocalTime localTime = evaluationAt.toLocalTime();

        if (covers(currentDaySchedule, localTime, false)) {
            return ParkingAvailabilityStatus.AVAILABLE;
        }

        Schedule previousDaySchedule = scheduleForDay(parkingOperation, evaluationAt.minusDays(1).getDayOfWeek());
        if (covers(previousDaySchedule, localTime, true)) {
            return ParkingAvailabilityStatus.AVAILABLE;
        }

        if (currentDaySchedule.isUnknown() || previousDaySchedule.isUnknown()) {
            return ParkingAvailabilityStatus.UNKNOWN;
        }
        return ParkingAvailabilityStatus.UNAVAILABLE;
    }

    private boolean covers(Schedule dailySchedule, LocalTime localTime, boolean fromPreviousDay) {
        if (dailySchedule == null || dailySchedule.isUnknown()) {
            return false;
        }
        if (dailySchedule.isAllDay()) {
            return !fromPreviousDay;
        }
        if (!dailySchedule.isOpen()) {
            return false;
        }
        if (dailySchedule.isOvernight()) {
            return fromPreviousDay
                    ? localTime.isBefore(dailySchedule.closeTime())
                    : !localTime.isBefore(dailySchedule.openTime());
        }
        return !fromPreviousDay
                && !localTime.isBefore(dailySchedule.openTime())
                && localTime.isBefore(dailySchedule.closeTime());
    }

    private Schedule scheduleForDay(ParkingOperation operation, DayOfWeek dayOfWeek) {
        return switch (dayOfWeek) {
            case MONDAY -> new Schedule(
                    operation.getMondayStatus(),
                    operation.getMondayOpenTime(),
                    operation.getMondayCloseTime()
            );
            case TUESDAY -> new Schedule(
                    operation.getTuesdayStatus(),
                    operation.getTuesdayOpenTime(),
                    operation.getTuesdayCloseTime()
            );
            case WEDNESDAY -> new Schedule(
                    operation.getWednesdayStatus(),
                    operation.getWednesdayOpenTime(),
                    operation.getWednesdayCloseTime()
            );
            case THURSDAY -> new Schedule(
                    operation.getThursdayStatus(),
                    operation.getThursdayOpenTime(),
                    operation.getThursdayCloseTime()
            );
            case FRIDAY -> new Schedule(
                    operation.getFridayStatus(),
                    operation.getFridayOpenTime(),
                    operation.getFridayCloseTime()
            );
            case SATURDAY -> new Schedule(
                    operation.getSaturdayStatus(),
                    operation.getSaturdayOpenTime(),
                    operation.getSaturdayCloseTime()
            );
            case SUNDAY -> new Schedule(
                    operation.getSundayStatus(),
                    operation.getSundayOpenTime(),
                    operation.getSundayCloseTime()
            );
        };
    }

    private record Schedule(
            ParkingOperationStatus status,
            LocalTime openTime,
            LocalTime closeTime
    ) {

        private boolean isUnknown() {
            return status == null
                    || status == ParkingOperationStatus.UNKNOWN
                    || (status == ParkingOperationStatus.OPEN
                    && !isAllDay() && !hasValidOperatingHours());
        }

        private boolean isAllDay() {
            return status != null
                    && (status == ParkingOperationStatus.ALL_DAY
                    || (status == ParkingOperationStatus.OPEN && isMidnightToMidnight()));
        }

        private boolean isOpen() {
            return status == ParkingOperationStatus.OPEN && hasValidOperatingHours();
        }

        private boolean hasValidOperatingHours() {
            return openTime != null && closeTime != null && !openTime.equals(closeTime);
        }

        private boolean isMidnightToMidnight() {
            return LocalTime.MIDNIGHT.equals(openTime) && LocalTime.MIDNIGHT.equals(closeTime);
        }

        private boolean isOvernight() {
            return isOpen() && openTime.isAfter(closeTime);
        }
    }

}
