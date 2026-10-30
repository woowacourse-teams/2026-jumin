package jumin.domain.parking.viewport;

import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.TimeoutException;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import org.springframework.transaction.TransactionSystemException;

public final class ViewportFailureDiagnostics {

    private static final int MAX_FAILURES = 32;
    private static final String UNAVAILABLE = "unavailable";

    private ViewportFailureDiagnostics() { }

    public static ViewportFailureSummary inspect(Throwable failure) {
        Objects.requireNonNull(failure);
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        ArrayDeque<Throwable> pending = new ArrayDeque<>();
        pending.add(failure);
        ViewportFailureReason reason = ViewportFailureReason.UNCLASSIFIED;
        String causeType = failure.getClass().getSimpleName();
        String sqlState = UNAVAILABLE;
        boolean timeout = false;
        while (!pending.isEmpty() && seen.size() < MAX_FAILURES) {
            Throwable current = pending.removeFirst();
            if (!seen.add(current)) {
                continue;
            }
            causeType = current.getClass().getSimpleName();
            reason = selectKnownReason(reason, current);
            timeout |= current instanceof TimeoutException || current instanceof SQLTimeoutException;
            sqlState = selectSqlState(sqlState, current);
            enqueueRelatedFailures(current, pending);
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

    private static void enqueueRelatedFailures(Throwable failure, ArrayDeque<Throwable> pending) {
        Throwable next = failure instanceof SQLException sql ? sql.getNextException() : null;
        if (next != null) {
            pending.addLast(next);
        }
        Throwable application = failure instanceof TransactionSystemException transaction
                ? transaction.getApplicationException() : null;
        if (application != null) {
            pending.addLast(application);
        }
        Throwable cause = failure.getCause();
        if (cause != null) {
            pending.addLast(cause);
        }
        for (Throwable suppressed : failure.getSuppressed()) {
            if (pending.size() >= MAX_FAILURES) {
                return;
            }
            pending.addLast(suppressed);
        }
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
