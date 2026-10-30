package jumin.domain.parking.viewport;

import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;

public enum ViewportFailureReason {
    UNCLASSIFIED,
    DB_QUEUE_FULL,
    DB_DEADLINE,
    DB_ADMISSION_REJECTED,
    DB_SHUTTING_DOWN,
    CELL_FLIGHT_LIMIT,
    CELL_LOADER_QUEUE_FULL,
    CELL_LOADER_CLOSED,
    CELL_INCOMPLETE_BATCH;

    public BusinessException failure() {
        return failure(null);
    }

    public BusinessException failure(Throwable cause) {
        return new BusinessException(ErrorCode.VIEWPORT_UNAVAILABLE, name(), cause);
    }
}
