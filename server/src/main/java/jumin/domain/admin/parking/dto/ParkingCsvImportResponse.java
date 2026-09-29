package jumin.domain.admin.parking.dto;

import jumin.domain.admin.parking.model.ParkingChanges;
import jumin.domain.admin.parking.model.ParkingCsvFile;

public record ParkingCsvImportResponse(
        String fileName,
        String fileSha256,
        int csvRowCount,
        ParkingCsvSummaryResponse summary
) {
    public static ParkingCsvImportResponse from(ParkingCsvFile file, ParkingChanges changes) {
        return new ParkingCsvImportResponse(
                file.fileName(), file.fileSha256(), file.rows().size(), ParkingCsvSummaryResponse.from(changes)
        );
    }
}
