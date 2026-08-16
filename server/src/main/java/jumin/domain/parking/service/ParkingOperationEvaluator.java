package jumin.domain.parking.service;

import java.time.DateTimeException;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import jumin.domain.parking.entity.ParkingOperation;
import jumin.domain.parking.entity.ParkingOperationStatus;
import org.springframework.stereotype.Component;

@Component
public class ParkingOperationEvaluator {

    public ParkingAvailabilityStatus evaluate(
            ParkingOperation operation,
            OffsetDateTime entryAt,
            OffsetDateTime exitAt
    ) {
        if (isInvalidRequest(operation, entryAt, exitAt)) {
            return ParkingAvailabilityStatus.UNKNOWN;
        }

        boolean unknownFound = false;
        OffsetDateTime currentAt = entryAt;

        while (currentAt.isBefore(exitAt)) {
            ParkingAvailabilityStatus statusAt = evaluateStatusAt(operation, currentAt);
            if (statusAt == ParkingAvailabilityStatus.UNAVAILABLE) {
                return ParkingAvailabilityStatus.UNAVAILABLE;
            }

            unknownFound |= statusAt == ParkingAvailabilityStatus.UNKNOWN;
            currentAt = nextBoundaryAt(operation, currentAt, exitAt);
        }
        if (unknownFound) {
            return ParkingAvailabilityStatus.UNKNOWN;
        }
        return ParkingAvailabilityStatus.AVAILABLE;
    }

    private boolean isInvalidRequest(
            ParkingOperation operation,
            OffsetDateTime entryAt,
            OffsetDateTime exitAt
    ) {
        if (operation == null || entryAt == null || exitAt == null) {
            return true;
        }

        return !exitAt.isAfter(entryAt);
    }

    private OffsetDateTime nextBoundaryAt(
            ParkingOperation operation,
            OffsetDateTime currentAt,
            OffsetDateTime exitAt
    ) {
        OffsetDateTime nextBoundaryAt = nextOccurrenceAt(currentAt, LocalTime.MIDNIGHT);
        Schedule currentDaySchedule = scheduleForDay(operation, currentAt.getDayOfWeek());
        Schedule previousDaySchedule = scheduleForDay(operation, currentAt.minusDays(1).getDayOfWeek());

        nextBoundaryAt = earlierBoundaryAt(nextBoundaryAt, nextCandidateBoundaryAt(currentAt, currentDaySchedule));
        nextBoundaryAt = earlierBoundaryAt(nextBoundaryAt, previousOvernightCloseAt(currentAt, previousDaySchedule));

        return earlierBoundaryAt(nextBoundaryAt, exitAt);
    }

    private OffsetDateTime nextCandidateBoundaryAt(OffsetDateTime currentAt, Schedule schedule) {
        if (!schedule.isTimedOpen()) {
            return null;
        }
        return earlierBoundaryAt(
                nextOccurrenceAt(currentAt, schedule.openTime()),
                nextOccurrenceAt(currentAt, schedule.closeTime())
        );
    }

    private OffsetDateTime previousOvernightCloseAt(OffsetDateTime currentAt, Schedule previousDaySchedule) {
        if (!previousDaySchedule.isOvernight()) {
            return null;
        }
        OffsetDateTime closeAt = currentAt.toLocalDate()
                .atTime(previousDaySchedule.closeTime())
                .atOffset(currentAt.getOffset());
        boolean closeIsAfterCurrent = closeAt.isAfter(currentAt);
        if (closeIsAfterCurrent) {
            return closeAt;
        }
        return null;
    }

    private OffsetDateTime nextOccurrenceAt(OffsetDateTime currentAt, LocalTime localTime) {
        if (localTime == null) {
            return null;
        }

        try {
            OffsetDateTime occurrenceAt = currentAt.toLocalDate()
                    .atTime(localTime)
                    .atOffset(currentAt.getOffset());

            if (!occurrenceAt.isAfter(currentAt)) {
                occurrenceAt = occurrenceAt.plusDays(1);
            }

            return occurrenceAt;
        } catch (DateTimeException exception) {
            return null;
        }
    }

    private OffsetDateTime earlierBoundaryAt(OffsetDateTime currentBoundaryAt, OffsetDateTime candidateBoundaryAt) {
        boolean candidateBoundaryExists = candidateBoundaryAt != null;
        boolean currentBoundaryExists = currentBoundaryAt != null;
        boolean candidateBoundaryIsNotEarlier = candidateBoundaryExists
                && currentBoundaryExists
                && !candidateBoundaryAt.isBefore(currentBoundaryAt);

        if (!candidateBoundaryExists || candidateBoundaryIsNotEarlier) {
            return currentBoundaryAt;
        }
        return candidateBoundaryAt;
    }

    private ParkingAvailabilityStatus evaluateStatusAt(ParkingOperation operation, OffsetDateTime currentAt) {
        Schedule currentDaySchedule = scheduleForDay(operation, currentAt.getDayOfWeek());
        LocalTime localTime = currentAt.toLocalTime();

        if (isCoveredByCurrentDay(currentDaySchedule, localTime)) {
            return ParkingAvailabilityStatus.AVAILABLE;
        }

        Schedule previousDaySchedule = scheduleForDay(operation, currentAt.minusDays(1).getDayOfWeek());
        if (isCoveredByPreviousDay(previousDaySchedule, localTime)) {
            return ParkingAvailabilityStatus.AVAILABLE;
        }

        boolean currentScheduleIsUnknown = currentDaySchedule.isUnknown();
        boolean previousScheduleIsUnknown = previousDaySchedule.isUnknown();

        if (currentScheduleIsUnknown || previousScheduleIsUnknown) {
            return ParkingAvailabilityStatus.UNKNOWN;
        }
        return ParkingAvailabilityStatus.UNAVAILABLE;
    }

    private boolean isCoveredByCurrentDay(Schedule schedule, LocalTime localTime) {
        if (schedule.isUnknown()) {
            return false;
        }
        if (schedule.isAllDay()) {
            return true;
        }
        if (!schedule.isTimedOpen()) {
            return false;
        }
        if (schedule.isOvernight()) {
            return !localTime.isBefore(schedule.openTime());
        }
        boolean isAtOrAfterOpening = !localTime.isBefore(schedule.openTime());
        boolean isBeforeClosing = localTime.isBefore(schedule.closeTime());

        return isAtOrAfterOpening && isBeforeClosing;
    }

    private boolean isCoveredByPreviousDay(Schedule schedule, LocalTime localTime) {
        return schedule.isOvernight() && localTime.isBefore(schedule.closeTime());
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
            boolean openScheduleHasInvalidHours = isOpenStatus()
                    && !isAllDay()
                    && !hasValidOperatingHours();

            return status == null
                    || status == ParkingOperationStatus.UNKNOWN
                    || openScheduleHasInvalidHours;
        }

        private boolean isAllDay() {
            boolean isOpenFromMidnightToMidnight = isOpenStatus() && isMidnightToMidnight();

            return status == ParkingOperationStatus.ALL_DAY
                    || isOpenFromMidnightToMidnight;
        }

        private boolean isTimedOpen() {
            return isOpenStatus() && hasValidOperatingHours();
        }

        private boolean isOpenStatus() {
            return status == ParkingOperationStatus.OPEN;
        }

        private boolean hasValidOperatingHours() {
            boolean openTimeExists = openTime != null;
            boolean closeTimeExists = closeTime != null;
            return openTimeExists
                    && closeTimeExists
                    && !openTime.equals(closeTime);
        }

        private boolean isMidnightToMidnight() {
            boolean opensAtMidnight = LocalTime.MIDNIGHT.equals(openTime);
            boolean closesAtMidnight = LocalTime.MIDNIGHT.equals(closeTime);
            return opensAtMidnight && closesAtMidnight;
        }

        private boolean isOvernight() {
            return isTimedOpen() && openTime.isAfter(closeTime);
        }
    }
}
