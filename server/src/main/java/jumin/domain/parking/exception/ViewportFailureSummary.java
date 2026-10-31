package jumin.domain.parking.exception;

public record ViewportFailureSummary(String reason, String causeType, String sqlState) {
}
