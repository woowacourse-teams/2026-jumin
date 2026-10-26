package jumin.domain.admin.parking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.LongStream;
import jumin.domain.admin.parking.csv.ParkingCsvColumn;
import jumin.domain.admin.parking.csv.ParkingCsvParser;
import jumin.domain.admin.parking.exception.ParkingCsvException;
import jumin.domain.admin.parking.model.ParkingCsvKey;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.domain.admin.parking.model.ParkingKey;
import jumin.domain.admin.parking.repository.ParkingCsvRepository;
import jumin.global.response.ValidationErrorField;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class ParkingCsvStagingSinkTest {

    @Test
    @DisplayName("마지막 배치와 마지막 오류 행의 키까지 적재한 뒤 중복을 검사한다")
    void includes_remaining_rows_and_the_last_invalid_key_in_duplicate_validation() {
        // given
        ParkingCsvRepository repository = mock(ParkingCsvRepository.class);
        List<ParkingCsvRow> stagedRows = new ArrayList<>();
        Map<ParkingKey, List<Long>> stagedRowNumbersByKey = new LinkedHashMap<>();
        doAnswer(invocation -> {
            List<ParkingCsvRow> rows = invocation.getArgument(0);
            stagedRows.addAll(rows);
            for (ParkingCsvRow row : rows) {
                stagedRowNumbersByKey.computeIfAbsent(row.key(), ignored -> new ArrayList<>()).add(row.rowNumber());
            }
            return null;
        }).when(repository).stageRows(anyList());
        doAnswer(invocation -> {
            List<ParkingCsvKey> keys = invocation.getArgument(0);
            for (ParkingCsvKey key : keys) {
                stagedRowNumbersByKey.computeIfAbsent(key.key(), ignored -> new ArrayList<>()).add(key.rowNumber());
            }
            return null;
        }).when(repository).stageKeys(anyList());
        when(repository.findDuplicateRowNumbers()).thenAnswer(invocation -> stagedRowNumbersByKey.values().stream()
                .filter(rowNumbers -> rowNumbers.size() > 1)
                .flatMap(List::stream)
                .sorted()
                .toList());
        ParkingCsvParser parser = new ParkingCsvParser("10MB");
        ParkingCsvStagingSink sink = new ParkingCsvStagingSink(repository);
        MockMultipartFile file = fileWithDuplicateInvalidLastRow();

        // when
        ParkingCsvException failure = assertThrows(ParkingCsvException.class, () -> parser.parse(file, sink));

        // then
        assertThat(stagedRows).extracting(ParkingCsvRow::rowNumber)
                .containsExactlyElementsOf(LongStream.rangeClosed(2, 502).boxed().toList());
        assertThat(failure.getErrors()).extracting(ValidationErrorField::getField).containsExactly(
                "rows[503].parking_lots.capacity",
                "rows[502].parking_lots.name",
                "rows[503].parking_lots.name"
        );
    }

    private MockMultipartFile fileWithDuplicateInvalidLastRow() {
        StringBuilder csv = new StringBuilder(String.join(",", ParkingCsvColumn.headers())).append('\n');
        for (int index = 0; index < 501; index++) {
            csv.append(String.join(",", row(index, "1"))).append('\n');
        }
        csv.append(String.join(",", row(500, "invalid"))).append('\n');
        return new MockMultipartFile("file", "parking.csv", "text/csv",
                csv.toString().getBytes(StandardCharsets.UTF_8));
    }

    private String[] row(int index, String capacity) {
        String[] values = new String[ParkingCsvColumn.values().length];
        Arrays.fill(values, "");
        values[ParkingCsvColumn.SOURCE.ordinal()] = "DATA_GO_KR";
        values[ParkingCsvColumn.SOURCE_EXTERNAL_ID.ordinal()] = "source-" + index;
        values[ParkingCsvColumn.NAME.ordinal()] = "주차장 " + index;
        values[ParkingCsvColumn.ADDRESS.ordinal()] = "주소 " + index;
        values[ParkingCsvColumn.CAPACITY.ordinal()] = capacity;
        values[ParkingCsvColumn.ACTIVE.ordinal()] = "true";
        values[ParkingCsvColumn.LOT_SOURCE_CHECKED_AT.ordinal()] = "2026-10-26T00:00:00Z";
        values[ParkingCsvColumn.OPERATION_SOURCE_CHECKED_AT.ordinal()] = "2026-10-26T00:00:00Z";
        return values;
    }
}
