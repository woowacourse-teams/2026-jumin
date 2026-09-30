package jumin.domain.admin.parking.model;

import java.util.List;

public record ParkingChanges(
        List<ParkingCsvRow> added,
        List<ParkingUpdate> updated,
        List<ParkingDbRow> deactivated,
        int unchangedCount
) {
    public ParkingChanges {
        added = List.copyOf(added);
        updated = List.copyOf(updated);
        deactivated = List.copyOf(deactivated);
    }
}
