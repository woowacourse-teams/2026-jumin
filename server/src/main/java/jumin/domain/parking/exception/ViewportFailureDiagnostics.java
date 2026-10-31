package jumin.domain.parking.exception;

import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.util.concurrent.TimeoutException;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import jumin.global.exception.ExceptionCauses;

public final class ViewportFailureDiagnostics {

    private static final String UNAVAILABLE = "unavailable";

    private ViewportFailureDiagnostics() { }

    public static ViewportFailureSummary inspect(Throwable failure) {
        ViewportFailureReason reason = ViewportFailureReason.UNCLASSIFIED;
        String causeType = failure.getClass().getSimpleName();
        String sqlState = UNAVAILABLE;
        boolean timeout = false;
        for (Throwable current : ExceptionCauses.collect(failure)) {
            causeType = current.getClass().getSimpleName();
            reason = selectKnownReason(reason, current);
            timeout |= current instanceof TimeoutException || current instanceof SQLTimeoutException;
            sqlState = selectSqlState(sqlState, current);
        }
        return new ViewportFailureSummary(resolvedReason(reason, sqlState, timeout).name(), causeType, sqlState);
    }

    private static ViewportFailureReason selectKnownReason(ViewportFailureReason selected, Throwable failure) {
        if (selected != ViewportFailureReason.UNCLASSIFIED) {
            return selected;
        }
        if (!(failure instanceof BusinessException exception)
                || exception.getErrorCode() != ErrorCode.VIEWPORT_UNAVAILABLE || exception.getReason() == null) {
            return selected;
        }
        try {
            ViewportFailureReason candidate = ViewportFailureReason.valueOf(exception.getReason());
            return switch (candidate) {
                case DB_CONNECTION_ERROR, DB_SQL_ERROR, DEADLINE -> ViewportFailureReason.UNCLASSIFIED;
                default -> candidate;
            };
        } catch (IllegalArgumentException unknownReason) {
            return selected;
        }
    }

    private static String selectSqlState(String selected, Throwable failure) {
        if (!(failure instanceof SQLException sql)) {
            return selected;
        }
        String state = sql.getSQLState();
        if (!selected.equals(UNAVAILABLE) || state == null || !state.matches("[0-9A-Z]{5}")) {
            return selected;
        }
        return state;
    }

    private static ViewportFailureReason resolvedReason(ViewportFailureReason reason, String sqlState, boolean timeout) {
        if (reason != ViewportFailureReason.UNCLASSIFIED) {
            return reason;
        }
        if (sqlState.startsWith("08")) {
            return ViewportFailureReason.DB_CONNECTION_ERROR;
        }
        if (!sqlState.equals(UNAVAILABLE)) {
            return ViewportFailureReason.DB_SQL_ERROR;
        }
        if (timeout) {
            return ViewportFailureReason.DEADLINE;
        }
        return reason;
    }
}
