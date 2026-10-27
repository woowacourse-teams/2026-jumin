package jumin.domain.admin.parking.csv;

import static jumin.domain.admin.parking.csv.ParkingCsvParserTestSupport.parseAndCollect;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import jumin.domain.admin.parking.exception.ParkingCsvException;
import jumin.domain.admin.parking.model.ParkingCsvKey;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.global.response.ValidationErrorField;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;

class ParkingCsvTemporalCompatibilityTest {

    private final ParkingCsvParser parser = new ParkingCsvParser("10MB");

    @ParameterizedTest
    @ValueSource(strings = {"2026-09-28T09:00:00.Z", "2026-09-28T09:00:00.+09:00"})
    @DisplayName("소수점 뒤 숫자가 없는 ISO 시각도 기존 파서와 같은 값으로 읽는다")
    void preserves_iso_timestamps_with_empty_fraction(String timestamp) {
        // given
        Instant expected = OffsetDateTime.parse(timestamp).toInstant();
        MockMultipartFile file = file(List.of(timestamp));

        // when
        List<ParkingCsvRow> parsed = parseAndCollect(parser, file).rows();

        // then
        assertThat(parsed).hasSize(1);
        assertThat(parsed.getFirst().rowNumber()).isEqualTo(2);
        assertThat(parsed.getFirst().lot().sourceCheckedAt()).isEqualTo(expected);
        assertThat(parsed.getFirst().operation().sourceCheckedAt()).isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {"2026-02-30T09:00:00.1234567Z", "2025-02-29T09:00:00.000000001+09:00"})
    @DisplayName("잘못된 날짜와 세밀한 소수초가 겹치면 날짜 형식 오류를 먼저 반환한다")
    void prioritizes_invalid_calendar_date_over_sub_microsecond_precision(String timestamp) {
        // given
        MockMultipartFile file = file(List.of(timestamp));

        // when
        ParkingCsvException failure = assertThrows(ParkingCsvException.class, () -> parseAndCollect(parser, file));

        // then
        assertTimestampErrors(failure, 2, "시간대 오프셋을 포함한 ISO 8601 시각이어야 합니다.");
    }

    @ParameterizedTest
    @ValueSource(strings = {"-4713-11-23T23:59:59.999999999Z", "+294277-01-01T00:00:00.000000001Z"})
    @DisplayName("DB 시각 범위와 정밀도를 모두 벗어나면 범위 오류를 먼저 반환한다")
    void prioritizes_database_range_over_sub_microsecond_precision(String timestamp) {
        // given
        MockMultipartFile file = file(List.of(timestamp));

        // when
        ParkingCsvException failure = assertThrows(ParkingCsvException.class, () -> parseAndCollect(parser, file));

        // then
        assertTimestampErrors(failure, 2, "PostgreSQL에 저장할 수 있는 시각 범위를 벗어났습니다.");
    }

    @Test
    @DisplayName("같은 날짜에서 오프셋만 바뀌어도 연도 경계를 넘는 UTC 시각을 정확히 계산한다")
    void preserves_offset_changes_for_the_same_calendar_date() {
        // given
        List<String> timestamps = List.of("0000-01-01T00:00:00.123456+18:00",
                "0000-01-01T00:00:00.123456-18:00", "0000-01-01T00:00:00.123456-00:00");
        List<Instant> expected = timestamps.stream()
                .map(value -> OffsetDateTime.parse(value).toInstant())
                .toList();
        MockMultipartFile file = file(timestamps);

        // when
        List<ParkingCsvRow> parsed = parseAndCollect(parser, file).rows();

        // then
        assertThat(parsed).extracting(ParkingCsvRow::rowNumber).containsExactly(2L, 3L, 4L);
        assertThat(parsed).extracting(row -> row.lot().sourceCheckedAt()).containsExactlyElementsOf(expected);
        assertThat(parsed).extracting(row -> row.operation().sourceCheckedAt()).containsExactlyElementsOf(expected);
    }

    @Test
    @DisplayName("정상 윤일 다음의 잘못된 윤일은 오류를 내고 후속 정상 행과 행번호를 유지한다")
    void preserves_valid_rows_after_an_invalid_leap_day() {
        // given
        List<String> timestamps = List.of("2024-02-29T12:00:00Z", "2025-02-29T12:00:00Z",
                "2024-02-29T12:00:01+18:00", "2025-02-28T23:59:59-18:00", "2025-03-01T00:00:00Z");
        MockMultipartFile file = file(timestamps);
        RecordingRowSink sink = new RecordingRowSink();
        List<Instant> expected = List.of(OffsetDateTime.parse(timestamps.get(0)).toInstant(),
                OffsetDateTime.parse(timestamps.get(2)).toInstant(),
                OffsetDateTime.parse(timestamps.get(3)).toInstant(),
                OffsetDateTime.parse(timestamps.get(4)).toInstant());

        // when
        ParkingCsvException failure = assertThrows(ParkingCsvException.class, () -> parser.parse(file, sink));

        // then
        assertTimestampErrors(failure, 3, "시간대 오프셋을 포함한 ISO 8601 시각이어야 합니다.");
        assertThat(sink.keys).extracting(ParkingCsvKey::rowNumber).containsExactly(2L, 3L, 4L, 5L, 6L);
        assertThat(sink.rows).extracting(ParkingCsvRow::rowNumber).containsExactly(2L, 4L, 5L, 6L);
        assertThat(sink.rows).extracting(row -> row.lot().sourceCheckedAt()).containsExactlyElementsOf(expected);
        assertThat(sink.rows).extracting(row -> row.operation().sourceCheckedAt()).containsExactlyElementsOf(expected);
    }

    private void assertTimestampErrors(ParkingCsvException failure, int rowNumber, String message) {
        assertThat(failure.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(failure.getErrors()).extracting(ValidationErrorField::getField).containsExactly(
                "rows[" + rowNumber + "].parking_lots.source_checked_at",
                "rows[" + rowNumber + "].parking_operations.source_checked_at");
        assertThat(failure.getErrors()).extracting(ValidationErrorField::getMessage).containsExactly(message, message);
    }

    private MockMultipartFile file(List<String> timestamps) {
        StringBuilder csv = new StringBuilder(String.join(",", ParkingCsvColumn.headers())).append('\n');
        for (int index = 0; index < timestamps.size(); index++) {
            String[] values = new String[ParkingCsvColumn.values().length];
            Arrays.fill(values, "");
            values[ParkingCsvColumn.SOURCE.ordinal()] = "DATA_GO_KR";
            values[ParkingCsvColumn.SOURCE_EXTERNAL_ID.ordinal()] = "compatibility-" + index;
            values[ParkingCsvColumn.NAME.ordinal()] = "시각 호환성 검증 " + index;
            values[ParkingCsvColumn.ADDRESS.ordinal()] = "주소 " + index;
            values[ParkingCsvColumn.ACTIVE.ordinal()] = "true";
            values[ParkingCsvColumn.LOT_SOURCE_CHECKED_AT.ordinal()] = timestamps.get(index);
            values[ParkingCsvColumn.OPERATION_SOURCE_CHECKED_AT.ordinal()] = timestamps.get(index);
            csv.append(String.join(",", values)).append('\n');
        }
        return new MockMultipartFile("file", "temporal-compatibility.csv", "text/csv",
                csv.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static final class RecordingRowSink implements ParkingCsvRowSink {

        private final List<ParkingCsvRow> rows = new ArrayList<>();
        private final List<ParkingCsvKey> keys = new ArrayList<>();

        @Override
        public void accept(ParkingCsvRow row) {
            rows.add(row);
        }

        @Override
        public void registerKey(ParkingCsvKey key) {
            keys.add(key);
        }

        @Override
        public void finish() {
            // 행과 키를 즉시 기록하므로 남은 버퍼가 없다.
        }

        @Override
        public List<Long> findDuplicateRowNumbers() {
            return List.of();
        }
    }
}
