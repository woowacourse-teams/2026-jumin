package jumin.domain.admin.parking.dto;

import jumin.domain.admin.parking.model.ParkingSyncSummary;

public record ParkingCsvSummaryResponse(
        int addedCount,
        int updatedCount,
        int reactivatedCount,
        int deactivatedCount,
        int unchangedCount
) {
    public static ParkingCsvSummaryResponse from(ParkingSyncSummary summary) {
        return new ParkingCsvSummaryResponse(
                summary.addedCount(), summary.updatedCount(), summary.reactivatedCount(),
                summary.deactivatedCount(), summary.unchangedCount()
        );
    }
}
