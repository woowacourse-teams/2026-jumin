package jumin.domain.admin.parking.service;

import jumin.domain.admin.parking.csv.ParkingCsvParser;
import jumin.domain.admin.parking.dto.ParkingCsvImportResponse;
import jumin.domain.admin.parking.model.ParkingCsvMetadata;
import jumin.domain.admin.parking.model.ParkingSyncSummary;
import jumin.domain.admin.parking.repository.ParkingCsvRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class ParkingCsvImportService {

    private final ParkingCsvParser parser;
    private final ParkingCsvSyncService syncService;
    private final ParkingCsvRepository repository;

    @Transactional
    public ParkingCsvImportResponse importFile(MultipartFile file) {
        repository.createStaging();
        ParkingCsvMetadata parsed = parser.parse(file, new ParkingCsvStagingSink(repository));
        repository.prepareStaging();
        ParkingSyncSummary summary = syncService.syncStaged();
        repository.dropStaging();
        return ParkingCsvImportResponse.from(parsed, summary);
    }
}
