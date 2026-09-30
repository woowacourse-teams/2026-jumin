package jumin.domain.admin.parking.service;

import java.time.Clock;
import jumin.domain.admin.parking.exception.ParkingCsvException;
import jumin.domain.admin.parking.model.ParkingChanges;
import jumin.domain.admin.parking.model.ParkingCsvFile;
import jumin.domain.admin.parking.repository.ParkingCsvRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ParkingCsvSyncService {

    private final ParkingCsvRepository repository;
    private final ParkingCsvDiffer differ;
    private final Clock clock;

    @Transactional
    public ParkingChanges sync(ParkingCsvFile file) {
        if (!repository.tryAcquireLock()) {
            throw new ParkingCsvException(HttpStatus.CONFLICT, "다른 주차장 CSV 업로드가 진행 중입니다.");
        }
        ParkingChanges changes = differ.compare(repository.findAll(), file.rows());
        repository.save(changes, clock.instant());
        return changes;
    }
}
