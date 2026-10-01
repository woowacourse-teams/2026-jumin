package jumin.domain.admin.parking.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import jumin.domain.admin.parking.exception.ParkingCsvException;
import jumin.domain.admin.parking.model.ParkingChanges;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.domain.admin.parking.model.ParkingDbRow;
import jumin.domain.admin.parking.model.ParkingKey;
import jumin.domain.admin.parking.model.ParkingUpdate;
import jumin.global.response.ValidationErrorField;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class ParkingCsvDiffer {

    public ParkingChanges compare(List<ParkingDbRow> databaseRows, List<ParkingCsvRow> csvRows) {
        Map<ParkingKey, ParkingCsvRow> csvMap = createCsvMap(csvRows);
        Map<ParkingKey, ParkingDbRow> databaseMap = createDatabaseMap(databaseRows);
        List<ParkingCsvRow> added = new ArrayList<>();
        List<ParkingUpdate> updated = new ArrayList<>();
        int unchangedCount = 0;

        for (Map.Entry<ParkingKey, ParkingCsvRow> entry : csvMap.entrySet()) {
            ParkingCsvRow csvRow = entry.getValue();
            ParkingDbRow databaseRow = databaseMap.remove(entry.getKey());

            if (databaseRow == null) {
                added.add(csvRow);
                continue;
            }

            if (sameValues(databaseRow, csvRow)) {
                unchangedCount++;
                continue;
            }

            updated.add(new ParkingUpdate(databaseRow, csvRow));
        }

        List<ParkingDbRow> deactivated = databaseMap.values()
                .stream()
                .filter(row -> row.lot().active())
                .toList();

        return new ParkingChanges(added, updated, deactivated, unchangedCount);
    }

    private Map<ParkingKey, ParkingCsvRow> createCsvMap(List<ParkingCsvRow> csvRows) {
        Map<ParkingKey, ParkingCsvRow> rowsByKey = new LinkedHashMap<>();
        Set<ParkingKey> duplicateKeys = new LinkedHashSet<>();
        for (ParkingCsvRow row : csvRows) {
            if (rowsByKey.putIfAbsent(row.key(), row) != null) {
                duplicateKeys.add(row.key());
            }
        }

        if (!duplicateKeys.isEmpty()) {
            List<ValidationErrorField> errors = new ArrayList<>();
            for (ParkingCsvRow row : csvRows) {
                if (duplicateKeys.contains(row.key())) {
                    errors.add(ValidationErrorField.of(
                            "rows[" + row.rowNumber() + "].parking_lots.name",
                            "CSV에 이름과 주소가 같은 주차장이 중복되어 있습니다."
                    ));
                }
            }
            throw new ParkingCsvException(HttpStatus.UNPROCESSABLE_ENTITY, "CSV 식별키가 중복되었습니다.", errors);
        }

        return rowsByKey;
    }

    private Map<ParkingKey, ParkingDbRow> createDatabaseMap(List<ParkingDbRow> databaseRows) {
        Map<ParkingKey, ParkingDbRow> rowsByKey = new LinkedHashMap<>();
        for (ParkingDbRow row : databaseRows) {
            if (rowsByKey.putIfAbsent(row.key(), row) != null) {
                throw new ParkingCsvException(HttpStatus.CONFLICT, "DB에 이름과 주소가 같은 주차장이 중복되어 있습니다.");
            }
        }
        return rowsByKey;
    }

    private boolean sameValues(ParkingDbRow databaseRow, ParkingCsvRow csvRow) {
        return Objects.equals(databaseRow.lot(), csvRow.lot())
                && Objects.equals(databaseRow.operation(), csvRow.operation());
    }
}
