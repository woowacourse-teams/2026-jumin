package jumin.domain.parking.viewport;

import java.time.Duration;
import java.sql.ResultSet;
import java.sql.SQLException;

public record ViewportDeadline(long expiresAtNanos) {

    public static ViewportDeadline after(Duration duration) {
        return new ViewportDeadline(System.nanoTime() + duration.toNanos());
    }

    public long remainingNanos() {
        return Math.max(0, expiresAtNanos - System.nanoTime());
    }

    public void requireRemaining() {
        if (remainingNanos() == 0 || Thread.currentThread().isInterrupted()) {
            throw new ViewportUnavailableException("viewport deadline을 초과했습니다.");
        }
    }

    public boolean next(ResultSet rows) throws SQLException {
        requireRemaining();
        boolean present = rows.next();
        requireRemaining();
        return present;
    }
}
