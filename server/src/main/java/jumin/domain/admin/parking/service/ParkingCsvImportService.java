package jumin.domain.admin.parking.service;

import jumin.domain.admin.parking.csv.ParkingCsvParser;
import jumin.domain.admin.parking.dto.ParkingCsvImportResponse;
import jumin.domain.admin.parking.model.ParkingChanges;
import jumin.domain.admin.parking.model.ParkingCsvFile;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class ParkingCsvImportService {

    private final ParkingCsvParser parser;
    private final ParkingCsvSyncService syncService;

    public ParkingCsvImportResponse importFile(MultipartFile file) {
        ParkingCsvFile parsed = parser.parse(file);
        ParkingChanges changes = syncService.sync(parsed);
        return ParkingCsvImportResponse.from(parsed, changes);
    }
}
