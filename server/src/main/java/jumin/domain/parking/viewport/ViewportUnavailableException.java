package jumin.domain.parking.viewport;

public class ViewportUnavailableException extends RuntimeException {

    public enum Reason {
        UNCLASSIFIED,
        DB_QUEUE_FULL,
        DB_DEADLINE,
        DB_CONNECTION_FENCED,
        DB_ADMISSION_REJECTED,
        DB_SHUTTING_DOWN,
        CELL_FLIGHT_LIMIT,
        CELL_LOADER_QUEUE_FULL,
        CELL_LOADER_CLOSED,
        CELL_INCOMPLETE_BATCH
    }

    private final Reason reason;

    public ViewportUnavailableException(String message) {
        this(Reason.UNCLASSIFIED, message);
    }

    public ViewportUnavailableException(String message, Throwable cause) {
        this(Reason.UNCLASSIFIED, message, cause);
    }

    public ViewportUnavailableException(Reason reason, String message) {
        super(message);
        this.reason = java.util.Objects.requireNonNull(reason);
    }

    public ViewportUnavailableException(Reason reason, String message, Throwable cause) {
        super(message, cause);
        this.reason = java.util.Objects.requireNonNull(reason);
    }

    public Reason getReason() {
        return reason;
    }
}
