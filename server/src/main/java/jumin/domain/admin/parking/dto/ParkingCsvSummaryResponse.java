package jumin.domain.admin.parking.dto;

import jumin.domain.admin.parking.model.ParkingChanges;
import jumin.domain.admin.parking.model.ParkingUpdate;

public record ParkingCsvSummaryResponse(
        int addedCount,
        int updatedCount,
        int reactivatedCount,
        int deactivatedCount,
        int unchangedCount
) {
    public static ParkingCsvSummaryResponse from(ParkingChanges changes) {
        int updated = 0;
        int reactivated = 0;
        int deactivated = changes.deactivated().size();
        for (ParkingUpdate update : changes.updated()) {
            if (!update.before().lot().active() && update.after().lot().active()) {
                reactivated++;
                continue;
            }
            if (update.before().lot().active() && !update.after().lot().active()) {
                deactivated++;
                continue;
            }
            updated++;
        }
        return new ParkingCsvSummaryResponse(
                changes.added().size(), updated, reactivated, deactivated, changes.unchangedCount()
        );
    }
}
