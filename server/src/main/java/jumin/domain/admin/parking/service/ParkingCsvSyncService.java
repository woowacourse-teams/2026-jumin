package jumin.domain.admin.parking.service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import jumin.domain.admin.parking.exception.ParkingCsvException;
import jumin.domain.admin.parking.model.ParkingCsvBatch;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.domain.admin.parking.model.ParkingDbRow;
import jumin.domain.admin.parking.model.ParkingSyncSummary;
import jumin.domain.admin.parking.repository.ParkingCsvRepository;
import jumin.domain.parking.viewport.ViewportMappingState;
import jumin.domain.parking.viewport.ViewportWriteCoordinator;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ParkingCsvSyncService {

    private static final int BATCH_SIZE = 500;

    private final ParkingCsvRepository repository;
    private final Clock clock;
    private final ViewportWriteCoordinator viewportWriter;

    @Transactional
    public ParkingSyncSummary syncStaged() {
        if (!repository.tryAcquireLock()) {
            throw new ParkingCsvException(HttpStatus.CONFLICT, "다른 주차장 CSV 업로드가 진행 중입니다.");
        }
        ViewportMappingState mappingState = viewportWriter.beforeSourceWrite();
        Instant now = clock.instant();
        Long maxId = repository.findMaxId();
        repository.matchStagedRows();
        ParkingSyncSummary summary = syncUploadedRows(now);
        if (maxId != null) {
            summary = summary.plus(deactivateMissingRows(maxId, now));
        }
        viewportWriter.afterSourceWrite(mappingState);
        return summary;
    }

    private ParkingSyncSummary syncUploadedRows(Instant now) {
        long afterRowNumber = 0;
        ParkingSyncSummary summary = ParkingSyncSummary.empty();
        while (true) {
            ParkingCsvBatch batch = repository.findStagedBatchMetadata(afterRowNumber, BATCH_SIZE);
            if (batch.rowCount() == 0) {
                return summary;
            }
            if (batch.summary().addedCount() > 0) {
                List<ParkingCsvRow> added = repository.findUnmatchedStagedRows(afterRowNumber, batch.lastRowNumber());
                if (added.size() != batch.summary().addedCount()) {
                    throw new IllegalStateException("추가할 주차장 데이터를 확인할 수 없습니다.");
                }
                repository.insertNewParkingLots(added, now);
            }
            repository.applyMatchedStagedBatch(afterRowNumber, batch, now);
            summary = summary.plus(batch.summary());
            afterRowNumber = batch.lastRowNumber();
        }
    }

    private ParkingSyncSummary deactivateMissingRows(long maxId, Instant now) {
        Long afterId = null;
        ParkingSyncSummary summary = ParkingSyncSummary.empty();
        while (true) {
            List<ParkingDbRow> missingRows = repository.findMissingStagedBatch(afterId, maxId, BATCH_SIZE);
            if (missingRows.isEmpty()) {
                return summary;
            }
            repository.deactivateMissingParkingLots(missingRows, now);
            summary = summary.plus(ParkingSyncSummary.deactivated(missingRows.size()));
            afterId = missingRows.getLast().id();
        }
    }
}
