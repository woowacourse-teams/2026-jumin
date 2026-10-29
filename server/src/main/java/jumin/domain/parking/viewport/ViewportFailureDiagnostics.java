package jumin.domain.parking.viewport;

import java.sql.SQLException;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;
import org.springframework.transaction.TransactionSystemException;

/** Bounded, message-free diagnostics: driver messages can contain SQL and input values. */
public final class ViewportFailureDiagnostics {

    public record Summary(String reason, String causeType, String sqlState) { }

    private ViewportFailureDiagnostics() { }

    public static Summary inspect(Throwable failure) {
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        ArrayDeque<Throwable> pending = new ArrayDeque<>();
        pending.add(failure);
        String reason = "UNCLASSIFIED";
        String causeType = failure.getClass().getSimpleName();
        String sqlState = "unavailable";
        boolean timeout = false;
        while (!pending.isEmpty() && seen.size() < 32) {
            Throwable current = pending.removeFirst();
            if (!seen.add(current)) {
                continue;
            }
            causeType = current.getClass().getSimpleName();
            if (reason.equals("UNCLASSIFIED") && current instanceof ViewportUnavailableException unavailable) {
                reason = unavailable.getReason().name();
            }
            if (current instanceof java.util.concurrent.TimeoutException
                    || current instanceof java.sql.SQLTimeoutException) {
                timeout = true;
            }
            if (current instanceof SQLException sql) {
                String state = sql.getSQLState();
                if (sqlState.equals("unavailable") && state != null && state.matches("[0-9A-Z]{5}")) {
                    sqlState = state;
                }
                if (sql.getNextException() != null) {
                    pending.addLast(sql.getNextException());
                }
            }
            if (current instanceof TransactionSystemException transaction
                    && transaction.getApplicationException() != null) {
                pending.addLast(transaction.getApplicationException());
            }
            if (current.getCause() != null) {
                pending.addLast(current.getCause());
            }
            // Keep both traversal work and retained references bounded for arbitrary graphs.
            for (Throwable suppressed : current.getSuppressed()) {
                if (pending.size() >= 32) {
                    break;
                }
                pending.addLast(suppressed);
            }
        }
        if (reason.equals("UNCLASSIFIED")) {
            if (sqlState.startsWith("08")) {
                reason = "DB_CONNECTION_ERROR";
            } else if (!sqlState.equals("unavailable")) {
                reason = "DB_SQL_ERROR";
            } else if (timeout) {
                reason = "DEADLINE";
            }
        }
        return new Summary(reason, causeType, sqlState);
    }
}
