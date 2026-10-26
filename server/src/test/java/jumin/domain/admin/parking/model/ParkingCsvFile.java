package jumin.domain.admin.parking.model;

import java.util.List;

public record ParkingCsvFile(String fileName, String fileSha256, List<ParkingCsvRow> rows) {

    public ParkingCsvFile {
        rows = List.copyOf(rows);
    }
}
