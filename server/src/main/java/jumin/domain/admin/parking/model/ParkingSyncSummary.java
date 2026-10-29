package jumin.domain.admin.parking.model;

public record ParkingSyncSummary(
        int addedCount,
        int updatedCount,
        int reactivatedCount,
        int deactivatedCount,
        int unchangedCount
) {
    public static ParkingSyncSummary empty() {
        return new ParkingSyncSummary(0, 0, 0, 0, 0);
    }

    public static ParkingSyncSummary deactivated(int count) {
        return new ParkingSyncSummary(0, 0, 0, count, 0);
    }

    public ParkingSyncSummary plus(ParkingSyncSummary summary) {
        return new ParkingSyncSummary(
                addedCount + summary.addedCount,
                updatedCount + summary.updatedCount,
                reactivatedCount + summary.reactivatedCount,
                deactivatedCount + summary.deactivatedCount,
                unchangedCount + summary.unchangedCount
        );
    }
}
