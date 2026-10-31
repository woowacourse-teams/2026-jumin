package jumin.global.exception;

import java.sql.SQLException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import org.springframework.transaction.TransactionSystemException;

public final class ExceptionCauses {

    private static final int MAX_FAILURES = 32;

    private ExceptionCauses() { }

    public static List<Throwable> collect(Throwable failure) {
        Objects.requireNonNull(failure);
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        ArrayDeque<Throwable> pending = new ArrayDeque<>();
        pending.add(failure);
        List<Throwable> failures = new ArrayList<>();
        while (!pending.isEmpty() && failures.size() < MAX_FAILURES) {
            Throwable current = pending.removeFirst();
            if (!seen.add(current)) {
                continue;
            }
            failures.add(current);
            enqueueRelatedFailures(current, pending);
        }
        return List.copyOf(failures);
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
}
