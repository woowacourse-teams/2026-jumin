package jumin.domain.parking.service;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ParkingSearchQueryValidator {

    private static final ZoneOffset SEOUL_OFFSET = ZoneOffset.ofHours(9);
    private static final int MAX_DURATION_MINUTES = 24 * 60;

    private final Clock clock;

    public void validate(ParkingSearchRequest request) {
        if (request == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT);
        }

        validateDateTimes(request);
        validateDuration(request);
    }

    private void validateDateTimes(ParkingSearchRequest request) {
        if (!isValidSeoulDateTime(request.entryAt())
                || !isValidSeoulDateTime(request.exitAt())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT);
        }

        if (!request.entryAt().isAfter(currentSeoulTime())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT);
        }
    }

    private boolean isValidSeoulDateTime(OffsetDateTime value) {
        return value != null
                && value.getOffset().equals(SEOUL_OFFSET)
                && value.getSecond() == 0
                && value.getNano() == 0
                && value.getMinute() % 10 == 0;
    }

    private OffsetDateTime currentSeoulTime() {
        return OffsetDateTime.now(clock).withOffsetSameInstant(SEOUL_OFFSET);
    }

    private void validateDuration(ParkingSearchRequest request) {
        long durationMinutes = Duration.between(request.entryAt(), request.exitAt()).toMinutes();
        if (durationMinutes <= 0 || durationMinutes > MAX_DURATION_MINUTES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT);
        }
    }
}
