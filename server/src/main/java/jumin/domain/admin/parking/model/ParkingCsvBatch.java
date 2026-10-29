package jumin.domain.admin.parking.model;

public record ParkingCsvBatch(
        int rowCount,
        long lastRowNumber,
        int lotUpdateCount,
        int operationUpdateCount,
        int operationInsertCount,
        int coordinatesUpdateCount,
        ParkingSyncSummary summary
) {
}
