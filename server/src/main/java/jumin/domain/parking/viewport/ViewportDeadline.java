package jumin.domain.parking.viewport;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;

public record ViewportDeadline(long expiresAtNanos) {

    public static ViewportDeadline after(Duration duration) {
        return new ViewportDeadline(System.nanoTime() + duration.toNanos());
    }

    public long remainingNanos() {
        return Math.max(0, expiresAtNanos - System.nanoTime());
    }

    public void requireRemaining() {
        if (remainingNanos() == 0 || Thread.currentThread().isInterrupted()) {
            throw ViewportFailureReason.UNCLASSIFIED.failure();
        }
    }

    public boolean next(ResultSet rows) throws SQLException {
        requireRemaining();
        boolean present = rows.next();
        requireRemaining();
        return present;
    }
}
