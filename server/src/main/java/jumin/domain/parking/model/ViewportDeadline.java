package jumin.domain.parking.model;

import java.time.Duration;
import jumin.domain.parking.exception.ViewportFailureReason;

public record ViewportDeadline(long expiresAtNanos) {

    public static ViewportDeadline after(Duration duration) {
        return new ViewportDeadline(System.nanoTime() + duration.toNanos());
    }

    public long remainingNanos() {
        return Math.max(0, expiresAtNanos - System.nanoTime());
    }

    public void requireRemaining() {
        if (remainingNanos() == 0 || Thread.currentThread().isInterrupted()) {
            throw ViewportFailureReason.DEADLINE.failure();
        }
    }
}
