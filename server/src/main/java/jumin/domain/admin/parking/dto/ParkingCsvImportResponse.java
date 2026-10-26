package jumin.domain.admin.parking.dto;

import jumin.domain.admin.parking.model.ParkingCsvMetadata;
import jumin.domain.admin.parking.model.ParkingSyncSummary;

public record ParkingCsvImportResponse(
        String fileName,
        String fileSha256,
        int csvRowCount,
        ParkingCsvSummaryResponse summary
) {
    public static ParkingCsvImportResponse from(ParkingCsvMetadata file, ParkingSyncSummary summary) {
        return new ParkingCsvImportResponse(
                file.fileName(), file.fileSha256(), file.rowCount(), ParkingCsvSummaryResponse.from(summary)
        );
    }
}
