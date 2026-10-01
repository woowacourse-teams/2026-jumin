package jumin.domain.admin.parking.model;

import java.util.Objects;

public record ParkingUpdate(ParkingDbRow before, ParkingCsvRow after) {

    public boolean lotChanged() {
        return !before.lot().equals(after.lot());
    }

    public boolean operationChanged() {
        return !Objects.equals(before.operation(), after.operation());
    }
}
