package jumin.domain.admin.parking.csv;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import jumin.domain.admin.parking.model.ParkingCsvFile;
import jumin.domain.admin.parking.model.ParkingCsvKey;
import jumin.domain.admin.parking.model.ParkingCsvMetadata;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.domain.admin.parking.model.ParkingKey;
import org.springframework.web.multipart.MultipartFile;

public final class ParkingCsvParserTestSupport {

    private ParkingCsvParserTestSupport() {
    }

    public static ParkingCsvFile parseAndCollect(ParkingCsvParser parser, MultipartFile file) {
        CollectingRowSink sink = new CollectingRowSink();
        ParkingCsvMetadata metadata = parser.parse(file, sink);
        return new ParkingCsvFile(metadata.fileName(), metadata.fileSha256(), sink.rows);
    }

    private static final class CollectingRowSink implements ParkingCsvRowSink {

        private final List<ParkingCsvRow> rows = new ArrayList<>();
        private final Map<ParkingKey, List<Long>> keyRows = new LinkedHashMap<>();

        @Override
        public void accept(ParkingCsvRow row) {
            rows.add(row);
        }

        @Override
        public void registerKey(ParkingCsvKey key) {
            keyRows.computeIfAbsent(key.key(), ignored -> new ArrayList<>()).add(key.rowNumber());
        }

        @Override
        public void finish() {
            // accept와 registerKey에서 즉시 수집하므로 남은 버퍼가 없다.
        }

        @Override
        public List<Long> findDuplicateRowNumbers() {
            List<Long> duplicateRowNumbers = new ArrayList<>();
            for (List<Long> rowNumbers : keyRows.values()) {
                if (rowNumbers.size() > 1) {
                    duplicateRowNumbers.addAll(rowNumbers);
                }
            }
            return duplicateRowNumbers;
        }
    }
}
