package jumin.domain.parking.viewport;

import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.IdentityHashMap;
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
        return new Inspection(failure).inspect();
    }

    private static final class Inspection {
        private final Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        private final ArrayDeque<Throwable> pending = new ArrayDeque<>();
        private String reason = ViewportFailureReason.UNCLASSIFIED.name();
        private String causeType;
        private String sqlState = UNAVAILABLE;
        private boolean timeout;

        private Inspection(Throwable failure) {
            pending.add(failure);
            causeType = failure.getClass().getSimpleName();
        }

        private ViewportFailureSummary inspect() {
            while (!pending.isEmpty() && seen.size() < MAX_FAILURES) {
                Throwable current = pending.removeFirst();
                if (!seen.add(current)) {
                    continue;
                }
                visit(current);
            }
            return new ViewportFailureSummary(resolvedReason(), causeType, sqlState);
        }

        private void visit(Throwable current) {
            causeType = current.getClass().getSimpleName();
            recordReason(current);
            recordTimeout(current);
            recordSqlStateAndEnqueueNext(current);
            enqueueApplicationException(current);
            enqueue(current.getCause());
            enqueueSuppressed(current);
        }

        private void recordReason(Throwable current) {
            if (!reason.equals(ViewportFailureReason.UNCLASSIFIED.name())) {
                return;
            }
            if (!(current instanceof BusinessException exception)) {
                return;
            }
            if (exception.getErrorCode() != ErrorCode.VIEWPORT_UNAVAILABLE || exception.getReason() == null) {
                return;
            }
            for (ViewportFailureReason candidate : ViewportFailureReason.values()) {
                if (candidate.name().equals(exception.getReason())) {
                    reason = candidate.name();
                    return;
                }
            }
        }

        private void recordTimeout(Throwable current) {
            if (current instanceof TimeoutException || current instanceof SQLTimeoutException) {
                timeout = true;
            }
        }

        private void recordSqlStateAndEnqueueNext(Throwable current) {
            if (!(current instanceof SQLException sql)) {
                return;
            }
            String state = sql.getSQLState();
            if (sqlState.equals(UNAVAILABLE) && state != null && state.matches("[0-9A-Z]{5}")) {
                sqlState = state;
            }
            enqueue(sql.getNextException());
        }

        private void enqueueApplicationException(Throwable current) {
            if (current instanceof TransactionSystemException transaction) {
                enqueue(transaction.getApplicationException());
            }
        }

        private void enqueue(Throwable failure) {
            if (failure != null) {
                pending.addLast(failure);
            }
        }

        private void enqueueSuppressed(Throwable current) {
            for (Throwable suppressed : current.getSuppressed()) {
                if (pending.size() >= MAX_FAILURES) {
                    return;
                }
                pending.addLast(suppressed);
            }
        }

        private String resolvedReason() {
            if (!reason.equals(ViewportFailureReason.UNCLASSIFIED.name())) {
                return reason;
            }
            if (sqlState.startsWith("08")) {
                return "DB_CONNECTION_ERROR";
            }
            if (!sqlState.equals(UNAVAILABLE)) {
                return "DB_SQL_ERROR";
            }
            if (timeout) {
                return "DEADLINE";
            }
            return reason;
        }
    }
}
