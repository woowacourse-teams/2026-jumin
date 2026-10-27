package jumin.domain.admin.parking.service;

import java.util.ArrayList;
import java.util.List;
import jumin.domain.admin.parking.csv.ParkingCsvRowSink;
import jumin.domain.admin.parking.model.ParkingCsvKey;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.domain.admin.parking.model.ParkingKey;
import jumin.domain.admin.parking.repository.ParkingCsvRepository;

final class ParkingCsvStagingSink implements ParkingCsvRowSink {

    private static final int BATCH_SIZE = 500;

    private final ParkingCsvRepository repository;
    private final List<ParkingCsvRow> rows = new ArrayList<>(BATCH_SIZE);
    private final List<ParkingCsvKey> keys = new ArrayList<>(BATCH_SIZE);
    private boolean hasPendingKey;
    private long pendingRowNumber;
    private String pendingName;
    private String pendingAddress;

    ParkingCsvStagingSink(ParkingCsvRepository repository) {
        this.repository = repository;
    }

    @Override
    public void accept(ParkingCsvRow row) {
        if (hasPendingKey && pendingRowNumber == row.rowNumber()) {
            // 정상 행의 키는 임시 적재한 행에서 읽으므로 별도로 전송하지 않는다.
            clearPendingKey();
        }
        rows.add(row);
        if (rows.size() == BATCH_SIZE) {
            flushRows();
        }
    }

    @Override
    public void registerKey(ParkingCsvKey key) {
        registerKey(key.rowNumber(), key.key().name(), key.key().address());
    }

    @Override
    public void registerKey(long rowNumber, String name, String address) {
        stagePendingKey();
        pendingRowNumber = rowNumber;
        pendingName = name;
        pendingAddress = address;
        hasPendingKey = true;
    }

    @Override
    public void finish() {
        stagePendingKey();
        flushKeys();
        flushRows();
    }

    @Override
    public List<Long> findDuplicateRowNumbers() {
        return repository.findDuplicateRowNumbers();
    }

    private void stagePendingKey() {
        if (!hasPendingKey) {
            return;
        }
        keys.add(new ParkingCsvKey(pendingRowNumber, new ParkingKey(pendingName, pendingAddress)));
        clearPendingKey();
        if (keys.size() == BATCH_SIZE) {
            flushKeys();
        }
    }

    private void clearPendingKey() {
        hasPendingKey = false;
        pendingName = null;
        pendingAddress = null;
    }

    private void flushRows() {
        if (!rows.isEmpty()) {
            repository.stageRows(rows);
            rows.clear();
        }
    }

    private void flushKeys() {
        if (!keys.isEmpty()) {
            repository.stageKeys(keys);
            keys.clear();
        }
    }
}
