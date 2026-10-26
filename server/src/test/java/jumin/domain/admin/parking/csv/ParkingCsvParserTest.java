package jumin.domain.admin.parking.csv;

import static jumin.domain.admin.parking.csv.ParkingCsvParserTestSupport.parseAndCollect;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import jumin.domain.admin.parking.exception.ParkingCsvException;
import jumin.domain.admin.parking.model.ParkingCsvFile;
import jumin.domain.admin.parking.model.ParkingCsvKey;
import jumin.domain.admin.parking.model.ParkingCsvMetadata;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.domain.admin.parking.model.ParkingKey;
import jumin.domain.parking.entity.ParkingDataSource;
import jumin.domain.parking.entity.ParkingOperationStatus;
import jumin.global.response.ValidationErrorField;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.util.unit.DataSize;
import org.springframework.web.multipart.MultipartFile;

class ParkingCsvParserTest {

    private final ParkingCsvParser parser = new ParkingCsvParser("10MB");

    @ParameterizedTest
    @CsvSource(value = {"true, true", "false, false", "'', NULL", "'   ', NULL"}, nullValues = "NULL")
    @DisplayName("공영 여부를 true와 false 또는 미확인 null로 변환한다")
    void reads_nullable_is_public_flag(String value, Boolean expected) {
        // given
        Map<String, String> row = validRow("A", "주소");
        row.put("parking_lots.is_public", value);

        // when
        ParkingCsvRow result = parseAndCollect(parser, file(csv(List.of(row)))).rows().getFirst();

        // then
        assertThat(result.lot().isPublic()).isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {"TRUE", "FALSE", "Y", "N", "1", "0", "공영", "민영", "미확인", "null"})
    @DisplayName("공영 여부는 소문자 true와 false 또는 빈 값만 허용한다")
    void rejects_invalid_is_public_flag(String value) {
        // given
        Map<String, String> row = validRow("A", "주소");
        row.put("parking_lots.is_public", value);

        // when
        ParkingCsvException exception = parseFailure(csv(List.of(row)));

        // then
        assertThat(exception.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(exception.getErrors()).extracting(ValidationErrorField::getField)
                .containsExactly("rows[2].parking_lots.is_public");
    }

    @Test
    @DisplayName("공영 여부 헤더가 없는 CSV는 422 헤더 오류로 거절한다")
    void rejects_csv_without_is_public_header() {
        // given
        List<String> headers = new ArrayList<>(ParkingCsvColumn.headers());
        headers.remove("parking_lots.is_public");

        // when
        ParkingCsvException exception = parseFailure(csv(headers, List.of(validRow("A", "주소"))));

        // then
        assertThat(exception.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(exception.getErrors()).extracting(ValidationErrorField::getField)
                .containsExactly("headers.parking_lots.is_public");
    }

    @Test
    @DisplayName("파일 끝을 읽기 전에 행과 키를 전달하고 원본 메타데이터를 반환한다")
    void streams_rows_before_reading_the_entire_file() throws Exception {
        // given
        Map<String, String> second = validRow("B", "주소 B");
        second.put("parking_lots.id", "x".repeat(10_000));
        byte[] bytes = ("\uFEFF" + csv(List.of(validRow(" A ", " 주소 A "), second)))
                .getBytes(StandardCharsets.UTF_8);
        TrackingInputStream input = new TrackingInputStream(bytes, 3);
        RecordingRowSink sink = new RecordingRowSink();
        sink.source = input;

        // when
        ParkingCsvMetadata metadata = parser.parse(streamedFile(input, bytes.length), sink);

        // then
        assertThat(metadata.fileName()).isEqualTo("parking.csv");
        assertThat(metadata.fileSha256()).isEqualTo(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)));
        assertThat(metadata.rowCount()).isEqualTo(2);
        assertThat(sink.rows).extracting(ParkingCsvRow::rowNumber).containsExactly(2L, 3L);
        assertThat(sink.keys).containsExactly(
                new ParkingCsvKey(2, new ParkingKey("A", "주소 A")),
                new ParkingCsvKey(3, new ParkingKey("B", "주소 B"))
        );
        assertThat(sink.firstRowReadPosition).isBetween(1, bytes.length - 1);
        assertThat(input.closed).isTrue();
    }

    @Test
    @DisplayName("필드나 열 개수가 잘못된 행도 키를 전달하고 중복 오류 순서를 유지한다")
    void streams_keys_of_invalid_rows_and_preserves_duplicate_error_order() {
        // given
        Map<String, String> invalidA = validRow("A", "주소 A");
        invalidA.put("parking_operations.base_fee", "invalid");
        String[] lines = csv(List.of(invalidA, validRow("B", "주소 B"),
                validRow("A", "주소 A"), validRow("B", "주소 B"))).split("\n", -1);
        lines[3] = lines[3] + ",extra";
        RecordingRowSink sink = new RecordingRowSink();
        sink.duplicateRowNumbers = List.of(2L, 4L, 3L, 5L);

        // when
        ParkingCsvException exception = assertThrows(ParkingCsvException.class,
                () -> parser.parse(file(String.join("\n", lines)), sink));

        // then
        assertThat(sink.keys).extracting(ParkingCsvKey::rowNumber).containsExactly(2L, 3L, 4L, 5L);
        assertThat(sink.rows).extracting(ParkingCsvRow::rowNumber).containsExactly(3L, 5L);
        assertThat(exception.getErrors()).extracting(ValidationErrorField::getField).containsExactly(
                "rows[2].parking_operations.base_fee", "rows[4]",
                "rows[2].parking_lots.name", "rows[4].parking_lots.name",
                "rows[3].parking_lots.name", "rows[5].parking_lots.name"
        );
    }

    @Test
    @DisplayName("행 저장 콜백이 실패하면 원래 예외를 전달하고 입력 스트림을 닫는다")
    void closes_input_when_row_sink_fails() throws Exception {
        // given
        byte[] bytes = csv(List.of(validRow("A", "주소"))).getBytes(StandardCharsets.UTF_8);
        TrackingInputStream input = new TrackingInputStream(bytes, 3);
        MultipartFile file = streamedFile(input, bytes.length);
        IllegalStateException failure = new IllegalStateException("저장 실패");
        RecordingRowSink sink = new RecordingRowSink();
        sink.acceptFailure = failure;

        // when
        IllegalStateException exception = assertThrows(IllegalStateException.class, () -> parser.parse(file, sink));

        // then
        assertThat(exception).isSameAs(failure);
        assertThat(input.closed).isTrue();
    }

    @ParameterizedTest
    @CsvSource({"Y, true", "N, false"})
    @DisplayName("기계식 Y와 N을 불리언으로 변환한다")
    void reads_mechanical_flag(String value, boolean expected) {
        // given
        Map<String, String> row = validRow("A", "주소");
        row.put("parking_lots.mechanical", value);

        // when
        ParkingCsvRow result = parseAndCollect(parser, file(csv(List.of(row)))).rows().getFirst();

        // then
        assertThat(result.lot().mechanical()).isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   "})
    @DisplayName("기계식 값이 비어 있으면 N으로 판정한다")
    void treats_blank_mechanical_flag_as_false(String value) {
        // given
        Map<String, String> row = validRow("A", "주소");
        row.put("parking_lots.mechanical", value);

        // when
        ParkingCsvRow result = parseAndCollect(parser, file(csv(List.of(row)))).rows().getFirst();

        // then
        assertThat(result.lot().mechanical()).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"true", "false", "1", "0", "y", "n", "UNKNOWN"})
    @DisplayName("기계식 CSV 값은 대문자 Y와 N 또는 빈 값만 허용한다")
    void rejects_invalid_mechanical_flag(String value) {
        // given
        Map<String, String> row = validRow("A", "주소");
        row.put("parking_lots.mechanical", value);

        // when
        ParkingCsvException exception = parseFailure(csv(List.of(row)));

        // then
        assertThat(exception.getErrors()).extracting(ValidationErrorField::getField)
                .containsExactly("rows[2].parking_lots.mechanical");
    }

    @Test
    @DisplayName("기계식 헤더가 없는 이전 CSV는 명확한 헤더 오류로 거절한다")
    void rejects_csv_without_mechanical_header() {
        // given
        List<String> headers = new ArrayList<>(ParkingCsvColumn.headers());
        headers.remove("parking_lots.mechanical");

        // when
        ParkingCsvException exception = parseFailure(csv(headers, List.of(validRow("A", "주소"))));

        // then
        assertThat(exception.getErrors()).extracting(ValidationErrorField::getField)
                .containsExactly("headers.parking_lots.mechanical");
    }

    @Test
    void readsBomReorderedHeadersQuotedCommaAndNewlineAndHashesOriginalBytes() throws Exception {
        // given
        Map<String, String> row = validRow("서울, 공영\n주차장", " 서울 강남구 1 ");
        row.put("parking_lots.id", "DB 관리 값이므로 무시");
        row.put("parking_operations.created_at", "잘못된 시각도 무시");
        row.put("parking_lots.latitude", "37.5");
        row.put("parking_lots.longitude", "127.0");
        List<String> headers = new ArrayList<>(ParkingCsvColumn.headers());
        Collections.reverse(headers);
        byte[] bytes = ("\uFEFF" + csv(headers, List.of(row))).getBytes(StandardCharsets.UTF_8);

        // when
        ParkingCsvFile result = parseAndCollect(parser, file("parking.CSV", bytes));

        // then
        assertThat(result.fileName()).isEqualTo("parking.CSV");
        assertThat(result.fileSha256()).isEqualTo(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)));
        assertThat(result.rows()).hasSize(1);
        ParkingCsvRow parsed = result.rows().getFirst();
        assertThat(parsed.rowNumber()).isEqualTo(2);
        assertThat(parsed.lot().name()).isEqualTo("서울, 공영\n주차장");
        assertThat(parsed.lot().address()).isEqualTo("서울 강남구 1");
        assertThat(parsed.lot().source()).isEqualTo(ParkingDataSource.SEOUL_PARKING_SITE);
        assertThat(parsed.lot().latitude()).isEqualTo(37.5);
        assertThat(parsed.lot().capacity()).isNull();
        assertThat(parsed.operation().baseFee()).isNull();
        assertThat(parsed.operation().weekday().status()).isNull();
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 2, 3})
    @DisplayName("작게 나뉜 UTF-8 BOM과 다중 바이트 문자, 따옴표 안 줄바꿈을 읽고 원본 해시를 유지한다")
    void readsChunkedUtf8BomAndHashesOriginalBytes(int chunkSize) throws Exception {
        // given
        byte[] bytes = ("\uFEFF" + csv(List.of(validRow("서울, 공영\n주차장😀", "서울 강남구"))))
                .getBytes(StandardCharsets.UTF_8);
        TrackingInputStream input = new TrackingInputStream(bytes, chunkSize);
        MultipartFile file = streamedFile(input, bytes.length);

        // when
        ParkingCsvFile result = parseAndCollect(parser, file);

        // then
        assertThat(result.rows()).hasSize(1);
        assertThat(result.rows().getFirst().lot().name()).isEqualTo("서울, 공영\n주차장😀");
        assertThat(result.rows().getFirst().lot().address()).isEqualTo("서울 강남구");
        assertThat(result.fileSha256()).isEqualTo(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)));
        assertThat(input.closed).isTrue();
    }

    @Test
    void convertsEquivalentNumberTimeAndOffsetRepresentationsToEqualBusinessValues() {
        // given
        Map<String, String> first = validRow("A", "주소");
        first.put("parking_lots.latitude", "37.5000");
        first.put("parking_lots.longitude", "-0.0");
        first.put("parking_lots.capacity", "0005");
        first.put("parking_operations.weekday_open_time", "09:00");
        first.put("parking_operations.source_checked_at", "2026-09-28T18:42:55.123456000+09:00");
        Map<String, String> second = new LinkedHashMap<>(first);
        second.put("parking_lots.latitude", "3.75e1");
        second.put("parking_lots.longitude", "0.0");
        second.put("parking_lots.capacity", "5");
        second.put("parking_lots.source_checked_at", "2026-09-28T09:42:55Z");
        second.put("parking_operations.weekday_open_time", "09:00:00");
        second.put("parking_operations.source_checked_at", "2026-09-28T09:42:55.123456Z");

        // when
        ParkingCsvRow parsedFirst = parseAndCollect(parser, file(csv(List.of(first)))).rows().getFirst();
        ParkingCsvRow parsedSecond = parseAndCollect(parser, file(csv(List.of(second)))).rows().getFirst();

        // then
        assertThat(parsedFirst.lot()).isEqualTo(parsedSecond.lot());
        assertThat(parsedFirst.operation()).isEqualTo(parsedSecond.operation());
        assertThat(parsedFirst.lot().sourceCheckedAt()).isEqualTo(Instant.parse("2026-09-28T09:42:55Z"));
    }

    @Test
    @DisplayName("반복되는 시간 열과 변경되는 시간 열을 각각 정확히 변환한다")
    void preserves_repeated_and_changing_temporal_values_in_each_column() {
        // given
        List<Map<String, String>> rows = new ArrayList<>();
        List<String> timeColumns = List.of(
                "parking_operations.weekday_open_time", "parking_operations.weekday_close_time",
                "parking_operations.weekend_open_time", "parking_operations.weekend_close_time",
                "parking_operations.holiday_open_time", "parking_operations.holiday_close_time");
        for (int index = 0; index < 4; index++) {
            Map<String, String> row = validRow("A" + index, "주소");
            row.put("parking_lots.source_checked_at", "2026-09-28T18:42:55.123456+09:00");
            row.put("parking_operations.source_checked_at", "2026-09-29T00:00:01Z");
            for (int column = 0; column < timeColumns.size(); column++) {
                row.put(timeColumns.get(column), "%02d:01:02".formatted(column + 1));
            }
            rows.add(row);
        }
        rows.get(2).put("parking_lots.source_checked_at", "2026-10-01T00:00:00Z");
        rows.get(2).put("parking_operations.weekday_open_time", "23:59:59");
        rows.get(3).put("parking_operations.weekend_close_time", "");

        // when
        List<ParkingCsvRow> parsed = parseAndCollect(parser, file(csv(rows))).rows();

        // then
        assertThat(parsed).extracting(row -> row.lot().sourceCheckedAt()).containsExactly(
                Instant.parse("2026-09-28T09:42:55.123456Z"), Instant.parse("2026-09-28T09:42:55.123456Z"),
                Instant.parse("2026-10-01T00:00:00Z"), Instant.parse("2026-09-28T09:42:55.123456Z"));
        assertThat(parsed).extracting(row -> row.operation().sourceCheckedAt())
                .containsOnly(Instant.parse("2026-09-29T00:00:01Z"));
        assertThat(parsed).extracting(row -> row.operation().weekday().openTime()).containsExactly(
                LocalTime.of(1, 1, 2), LocalTime.of(1, 1, 2), LocalTime.of(23, 59, 59), LocalTime.of(1, 1, 2));
        assertThat(parsed).extracting(row -> row.operation().weekday().closeTime()).containsOnly(LocalTime.of(2, 1, 2));
        assertThat(parsed).extracting(row -> row.operation().weekend().openTime()).containsOnly(LocalTime.of(3, 1, 2));
        assertThat(parsed).extracting(row -> row.operation().weekend().closeTime())
                .containsExactly(LocalTime.of(4, 1, 2), LocalTime.of(4, 1, 2), LocalTime.of(4, 1, 2), null);
        assertThat(parsed).extracting(row -> row.operation().holiday().openTime()).containsOnly(LocalTime.of(5, 1, 2));
        assertThat(parsed).extracting(row -> row.operation().holiday().closeTime()).containsOnly(LocalTime.of(6, 1, 2));
    }

    @Test
    @DisplayName("정상 시간 다음에 반복되는 잘못된 시간도 행별 오류를 원래 순서로 반환한다")
    void reports_each_repeated_invalid_temporal_value_after_valid_values() {
        // given
        Map<String, String> first = validRow("A", "주소");
        first.put("parking_operations.weekday_open_time", "09:01");
        List<Map<String, String>> rows = new ArrayList<>();
        rows.add(first);
        for (int index = 0; index < 2; index++) {
            Map<String, String> invalid = validRow("invalid" + index, "주소");
            invalid.put("parking_lots.source_checked_at", "2026-09-28T18:42:55.1234567+09:00");
            invalid.put("parking_operations.weekday_open_time", "24:00");
            invalid.put("parking_operations.source_checked_at", "+294277-01-01T00:00:00Z");
            rows.add(invalid);
        }
        Map<String, String> last = new LinkedHashMap<>(first);
        last.put("parking_lots.name", "B");
        rows.add(last);
        RecordingRowSink sink = new RecordingRowSink();

        // when
        ParkingCsvException exception = assertThrows(ParkingCsvException.class,
                () -> parser.parse(file(csv(rows)), sink));

        // then
        assertThat(exception.getErrors()).extracting(ValidationErrorField::getField).containsExactly(
                "rows[3].parking_lots.source_checked_at", "rows[3].parking_operations.weekday_open_time",
                "rows[3].parking_operations.source_checked_at", "rows[4].parking_lots.source_checked_at",
                "rows[4].parking_operations.weekday_open_time", "rows[4].parking_operations.source_checked_at");
        assertThat(exception.getErrors()).extracting(ValidationErrorField::getMessage).containsExactly(
                "DB에 정확히 저장할 수 있도록 소수 초는 마이크로초(6자리) 정밀도여야 합니다.",
                "HH:mm 또는 HH:mm:ss 형식의 유효한 시간이어야 합니다.",
                "PostgreSQL에 저장할 수 있는 시각 범위를 벗어났습니다.",
                "DB에 정확히 저장할 수 있도록 소수 초는 마이크로초(6자리) 정밀도여야 합니다.",
                "HH:mm 또는 HH:mm:ss 형식의 유효한 시간이어야 합니다.",
                "PostgreSQL에 저장할 수 있는 시각 범위를 벗어났습니다.");
        assertThat(sink.rows).extracting(ParkingCsvRow::rowNumber).containsExactly(2L, 5L);
        assertThat(sink.rows.getFirst().lot().sourceCheckedAt()).isEqualTo(sink.rows.getLast().lot().sourceCheckedAt());
        assertThat(sink.rows.getFirst().operation()).isEqualTo(sink.rows.getLast().operation());
    }

    @ParameterizedTest
    @CsvSource({"0005, 5", "000000000000000000000001, 1", "2147483647, 2147483647", "0, 0"})
    @DisplayName("음이 아닌 정수는 선행 0과 최대 정수 범위를 유지한다")
    void accepts_ascii_integer_boundaries_and_leading_zeroes(String value, int expected) {
        // given
        Map<String, String> row = validRow("A", "주소");
        row.put("parking_lots.capacity", value);

        // when
        ParkingCsvRow parsed = parseAndCollect(parser, file(csv(List.of(row)))).rows().getFirst();

        // then
        assertThat(parsed.lot().capacity()).isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {"+1", "-0", "1.0", "1e2", "１", "١", "00a", "2147483648"})
    @DisplayName("부호와 소수, 지수, 비 ASCII 숫자, 범위 초과 정수를 거부한다")
    void rejects_non_ascii_or_non_integer_values(String value) {
        // given
        Map<String, String> row = validRow("A", "주소");
        row.put("parking_lots.capacity", value);

        // when
        ParkingCsvException exception = parseFailure(csv(List.of(row)));

        // then
        assertThat(exception.getErrors()).extracting(ValidationErrorField::getField)
                .containsExactly("rows[2].parking_lots.capacity");
    }

    @Test
    @DisplayName("반복, 변경, 빈 값과 복원된 숫자를 열별로 정확히 변환한다")
    void preserves_repeated_changing_blank_and_restored_numeric_values() {
        // given
        List<String> integerColumns = List.of("parking_lots.capacity", "parking_operations.base_free_minutes",
                "parking_operations.base_minutes", "parking_operations.base_fee", "parking_operations.additional_minutes",
                "parking_operations.additional_fee", "parking_operations.daily_max_fee", "parking_operations.monthly_fee");
        List<Map<String, String>> rows = new ArrayList<>();
        for (int index = 0; index < 5; index++) {
            Map<String, String> row = validRow("numeric" + index, "주소");
            for (int column = 0; column < integerColumns.size(); column++) {
                row.put(integerColumns.get(column), Integer.toString(1000 + column));
            }
            row.put("parking_lots.latitude", "-0.0");
            row.put("parking_lots.longitude", "+1.27e2");
            rows.add(row);
        }
        for (int column = 0; column < integerColumns.size(); column++) {
            rows.get(2).put(integerColumns.get(column), Integer.toString(2000 + column));
            rows.get(3).put(integerColumns.get(column), "");
        }
        rows.get(2).put("parking_lots.latitude", "90");
        rows.get(2).put("parking_lots.longitude", "-180");
        rows.get(3).put("parking_lots.latitude", "");
        rows.get(3).put("parking_lots.longitude", "");

        // when
        List<ParkingCsvRow> parsed = parseAndCollect(parser, file(csv(rows))).rows();

        // then
        for (int index : new int[]{0, 1, 4}) {
            assertThat(integerValues(parsed.get(index))).containsExactly(1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007);
        }
        assertThat(integerValues(parsed.get(2))).containsExactly(2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007);
        assertThat(integerValues(parsed.get(3))).containsOnlyNulls();
        assertThat(parsed).extracting(row -> row.lot().latitude()).containsExactly(0.0, 0.0, 90.0, null, 0.0);
        assertThat(parsed).extracting(row -> row.lot().longitude()).containsExactly(127.0, 127.0, -180.0, null, 127.0);
        assertThat(Double.doubleToRawLongBits(parsed.getLast().lot().latitude())).isZero();
    }

    @Test
    @DisplayName("정상 숫자 다음의 반복된 범위 오류를 수집하고 정상 숫자가 다시 나오면 복원한다")
    void reports_repeated_numeric_errors_without_replacing_valid_values() {
        // given
        List<Map<String, String>> rows = new ArrayList<>();
        for (int index = 0; index < 4; index++) {
            Map<String, String> row = validRow("numeric" + index, "주소");
            row.put("parking_lots.latitude", "90");
            row.put("parking_lots.longitude", "180");
            row.put("parking_lots.capacity", "2147483647");
            row.put("parking_operations.base_fee", "1000");
            rows.add(row);
        }
        for (int index : new int[]{1, 2}) {
            rows.get(index).put("parking_lots.latitude", "180");
            rows.get(index).put("parking_lots.longitude", "1e309");
            rows.get(index).put("parking_lots.capacity", "2147483648");
            rows.get(index).put("parking_operations.base_fee", "-1");
        }
        RecordingRowSink sink = new RecordingRowSink();

        // when
        ParkingCsvException exception = assertThrows(ParkingCsvException.class,
                () -> parser.parse(file(csv(rows)), sink));

        // then
        assertThat(exception.getErrors()).extracting(ValidationErrorField::getField).containsExactly(
                "rows[3].parking_lots.latitude", "rows[3].parking_lots.longitude", "rows[3].parking_lots.capacity",
                "rows[3].parking_operations.base_fee", "rows[4].parking_lots.latitude", "rows[4].parking_lots.longitude",
                "rows[4].parking_lots.capacity", "rows[4].parking_operations.base_fee");
        assertThat(sink.rows).extracting(ParkingCsvRow::rowNumber).containsExactly(2L, 5L);
        assertThat(sink.rows).extracting(row -> row.lot().latitude()).containsOnly(90.0);
        assertThat(sink.rows).extracting(row -> row.lot().longitude()).containsOnly(180.0);
        assertThat(sink.rows).extracting(row -> row.lot().capacity()).containsOnly(Integer.MAX_VALUE);
        assertThat(sink.rows).extracting(row -> row.operation().baseFee()).containsOnly(1000);
    }

    @Test
    @DisplayName("숫자의 선행 0이 길어도 기존 정수와 좌표 변환 결과를 유지한다")
    void preserves_long_numeric_inputs() {
        // given
        List<Map<String, String>> rows = new ArrayList<>();
        for (int index = 0; index < 2; index++) {
            Map<String, String> row = validRow("numeric" + index, "주소");
            row.put("parking_lots.capacity", "0".repeat(128) + "1000");
            row.put("parking_lots.latitude", "0".repeat(128) + "37.5");
            rows.add(row);
        }

        // when
        List<ParkingCsvRow> parsed = parseAndCollect(parser, file(csv(rows))).rows();

        // then
        assertThat(parsed).extracting(row -> row.lot().capacity()).containsExactly(1000, 1000);
        assertThat(parsed).extracting(row -> row.lot().latitude()).containsExactly(37.5, 37.5);
    }

    @ParameterizedTest
    @CsvSource({"+1., 1", "-.5, -0.5", "1.e1, 10", ".125e+2, 12.5", "-1e-400, 0", "-90, -90", "90, 90"})
    @DisplayName("좌표의 소수와 지수 표기, 언더플로와 경계값을 반복해서 읽는다")
    void accepts_repeated_decimal_grammar(String value, double expected) {
        // given
        Map<String, String> first = validRow("A", "주소");
        first.put("parking_lots.latitude", value);
        Map<String, String> second = validRow("B", "주소");
        second.put("parking_lots.latitude", value);

        // when
        List<ParkingCsvRow> parsed = parseAndCollect(parser, file(csv(List.of(first, second)))).rows();

        // then
        assertThat(parsed).extracting(row -> row.lot().latitude()).containsExactly(expected, expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {"0x1.0p0", "1f", ".", "+", "1e", "１", "1_0", "NaN", "Infinity", "90.00001"})
    @DisplayName("정상 좌표 사이에 반복되는 잘못된 소수 표기도 행마다 거절한다")
    void rejects_repeated_invalid_decimal_grammar(String value) {
        // given
        Map<String, String> first = validRow("A", "주소");
        first.put("parking_lots.latitude", "1.5");
        Map<String, String> second = validRow("B", "주소");
        second.put("parking_lots.latitude", value);
        Map<String, String> third = validRow("C", "주소");
        third.put("parking_lots.latitude", value);
        Map<String, String> fourth = validRow("D", "주소");
        fourth.put("parking_lots.latitude", "2.5");
        RecordingRowSink sink = new RecordingRowSink();

        // when
        ParkingCsvException exception = assertThrows(ParkingCsvException.class,
                () -> parser.parse(file(csv(List.of(first, second, third, fourth))), sink));

        // then
        assertThat(exception.getErrors()).extracting(ValidationErrorField::getField)
                .containsExactly("rows[3].parking_lots.latitude", "rows[4].parking_lots.latitude");
        assertThat(sink.rows).extracting(row -> row.lot().latitude()).containsExactly(1.5, 2.5);
    }

    @Test
    void allowsOpenWithoutTimesAndPreservesOpenStatus() {
        // given
        Map<String, String> row = validRow("A", "주소");
        row.put("parking_operations.weekday_status", "OPEN");

        // when
        ParkingCsvRow result = parseAndCollect(parser, file(csv(List.of(row)))).rows().getFirst();

        // then
        assertThat(result.operation().weekday().status()).isEqualTo(ParkingOperationStatus.OPEN);
        assertThat(result.operation().weekday().openTime()).isNull();
        assertThat(result.operation().weekday().closeTime()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"OPEN", "CLOSED", "UNKNOWN", ""})
    void allowsValidTimesForEveryStatusIncludingEmptyStatus(String status) {
        // given
        Map<String, String> row = validRow("A", "주소");
        row.put("parking_operations.weekday_status", status);
        row.put("parking_operations.weekday_open_time", "09:00");
        row.put("parking_operations.weekday_close_time", "09:00:00");

        // when
        ParkingCsvRow result = parseAndCollect(parser, file(csv(List.of(row)))).rows().getFirst();

        // then
        assertThat(result.operation().weekday().openTime()).isEqualTo(LocalTime.of(9, 0));
        assertThat(result.operation().weekday().closeTime()).isEqualTo(LocalTime.of(9, 0));
    }

    @Test
    void collectsAllFieldErrorsAndAllDuplicateRowsEvenIfOneRowHasOtherErrors() {
        // given
        Map<String, String> first = validRow(" A ", " 주소 ");
        first.put("parking_operations.base_fee", "100원");
        first.put("parking_lots.latitude", "91");
        Map<String, String> second = validRow("A", "주소");
        second.put("parking_lots.source", "DATA_GO_KR");

        // when
        ParkingCsvException exception = parseFailure(csv(List.of(first, second)));

        // then
        assertThat(exception.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(exception.getErrors()).extracting(ValidationErrorField::getField)
                .containsExactlyInAnyOrder("rows[2].parking_operations.base_fee", "rows[2].parking_lots.latitude",
                        "rows[2].parking_lots.name", "rows[3].parking_lots.name");
    }

    @Test
    void keepsInternalSpacesAndUsesTupleIdentityInsteadOfConcatenatingKeyParts() {
        // given
        Map<String, String> first = validRow("ab", "c");
        Map<String, String> second = validRow("a", "bc");
        Map<String, String> third = validRow("a b", "c");

        // when
        ParkingCsvFile result = parseAndCollect(parser, file(csv(List.of(first, second, third))));

        // then
        assertThat(result.rows()).hasSize(3);
        assertThat(result.rows().get(2).lot().name()).isEqualTo("a b");
    }

    @ParameterizedTest
    @ValueSource(strings = {"\t", "\u2003", "\u00a0"})
    void trimsOnlyOrdinarySpacesWithoutCollapsingDistinctKeys(String whitespace) {
        // given
        Map<String, String> first = validRow("A", "주소");
        first.put("parking_lots.sigungu", "   ");
        Map<String, String> second = validRow(" " + whitespace + "A" + whitespace + " ", " 주소 ");
        second.put("parking_lots.sigungu", " " + whitespace + " ");

        // when
        List<ParkingCsvRow> rows = parseAndCollect(parser, file(csv(List.of(first, second)))).rows();

        // then
        assertThat(rows).hasSize(2);
        assertThat(rows.getFirst().lot().sigungu()).isNull();
        assertThat(rows.getLast().lot().name()).isEqualTo(whitespace + "A" + whitespace);
        assertThat(rows.getLast().key().name()).isEqualTo(whitespace + "A" + whitespace);
        assertThat(rows.getLast().lot().address()).isEqualTo("주소");
        assertThat(rows.getLast().lot().sigungu()).isEqualTo(whitespace);
    }

    @Test
    void validatesRequiredAndOptionalValuesWithoutSilentlyCoercingThem() {
        // given
        Map<String, String> row = validRow("A", " ");
        row.put("parking_lots.source", "SEOUL_PARKING_INFO");
        row.put("parking_lots.source_external_id", "");
        row.put("parking_lots.active", "TRUE");
        row.put("parking_lots.capacity", "2147483648");
        row.put("parking_lots.latitude", "NaN");
        row.put("parking_lots.longitude", "Infinity");
        row.put("parking_operations.base_fee", "-1");
        row.put("parking_operations.weekday_paid", "1");
        row.put("parking_operations.weekend_status", "ALL_DAY");
        row.put("parking_lots.sido", "\0");

        // when
        ParkingCsvException exception = parseFailure(csv(List.of(row)));

        // then
        assertThat(exception.getErrors()).hasSize(11);
        assertThat(exception.getErrors()).extracting(ValidationErrorField::getField)
                .contains("rows[2].parking_lots.address", "rows[2].parking_lots.sido",
                        "rows[2].parking_lots.capacity", "rows[2].parking_lots.active");
    }

    @ParameterizedTest
    @ValueSource(strings = {"24:00", "09:60", "9:00", "09:00:60", "09:00:00.1", "09:00+09:00"})
    void rejectsInvalidTimeFormatsAndRanges(String time) {
        // given
        Map<String, String> row = validRow("A", "주소");
        row.put("parking_operations.holiday_open_time", time);

        // when
        ParkingCsvException exception = parseFailure(csv(List.of(row)));

        // then
        assertThat(exception.getErrors()).extracting(ValidationErrorField::getField)
                .containsExactly("rows[2].parking_operations.holiday_open_time");
    }

    @ParameterizedTest
    @ValueSource(strings = {"2026-02-30T09:00:00Z", "2026-09-28T09:00:00", "2026-09-28T09:00:00.1234567Z", ""})
    void rejectsInvalidOrMissingOffsetTimestampsAndSubMicrosecondValues(String timestamp) {
        // given
        Map<String, String> row = validRow("A", "주소");
        row.put("parking_lots.source_checked_at", timestamp);

        // when
        ParkingCsvException exception = parseFailure(csv(List.of(row)));

        // then
        assertThat(exception.getErrors()).extracting(ValidationErrorField::getField)
                .containsExactly("rows[2].parking_lots.source_checked_at");
    }

    @ParameterizedTest
    @ValueSource(strings = {"-4713-11-24T00:00:00Z", "+294276-12-31T23:59:59.999999Z"})
    void acceptsExactPostgresTimestampBoundaryValues(String timestamp) {
        // given
        Map<String, String> row = validRow("A", "주소");
        row.put("parking_lots.source_checked_at", timestamp);

        // when
        ParkingCsvRow parsed = parseAndCollect(parser, file(csv(List.of(row)))).rows().getFirst();

        // then
        assertThat(parsed.lot().sourceCheckedAt()).isEqualTo(Instant.parse(timestamp));
    }

    @ParameterizedTest
    @ValueSource(strings = {"-4713-11-23T23:59:59.999999Z", "+294277-01-01T00:00:00Z"})
    void rejectsValuesOutsidePostgresTimestampRange(String timestamp) {
        // given
        Map<String, String> row = validRow("A", "주소");
        row.put("parking_lots.source_checked_at", timestamp);

        // when
        ParkingCsvException exception = parseFailure(csv(List.of(row)));

        // then
        assertThat(exception.getErrors()).extracting(ValidationErrorField::getField)
                .containsExactly("rows[2].parking_lots.source_checked_at");
    }

    @Test
    void measuresTextLengthAsCharactersAndRejectsOverlongValues() {
        // given
        Map<String, String> valid = validRow("😀".repeat(100), "주소");
        Map<String, String> invalid = validRow("A".repeat(101), "주소");

        // when
        ParkingCsvFile result = parseAndCollect(parser, file(csv(List.of(valid))));
        ParkingCsvException exception = parseFailure(csv(List.of(invalid)));

        // then
        assertThat(result.rows()).hasSize(1);
        assertThat(exception.getErrors()).extracting(ValidationErrorField::getField)
                .containsExactly("rows[2].parking_lots.name");
    }

    @Test
    void reportsMissingDuplicateAndUndefinedHeadersTogether() {
        // given
        List<String> headers = new ArrayList<>(ParkingCsvColumn.headers());
        headers.set(0, "unexpected");
        headers.set(1, "parking_lots.name");

        // when
        ParkingCsvException exception = parseFailure(csv(headers, List.of(validRow("A", "주소"))));

        // then
        assertThat(exception.getErrors()).extracting(ValidationErrorField::getField)
                .containsExactlyInAnyOrder("headers[1]", "headers[4]", "headers.parking_lots.id", "headers.parking_lots.source");
    }

    @Test
    void rejectsHeaderOnlyFileAndEmptyFile() {
        // given
        String headerOnly = String.join(",", ParkingCsvColumn.headers()) + "\n";

        // when
        ParkingCsvException headerException = parseFailure(headerOnly);
        ParkingCsvException emptyException = parseFailure("");

        // then
        assertThat(headerException.getErrors()).extracting(ValidationErrorField::getField).containsExactly("file");
        assertThat(emptyException.getErrors()).extracting(ValidationErrorField::getField).containsExactly("file");
    }

    @Test
    void rejectsBlankRecordsAndWrongColumnCountRatherThanSkippingThem() {
        // given
        String input = csv(List.of(validRow("A", "주소"))) + "\nmissing,columns\n";

        // when
        ParkingCsvException exception = parseFailure(input);

        // then
        assertThat(exception.getErrors()).extracting(ValidationErrorField::getField)
                .containsExactly("rows[3]", "rows[4]");
    }

    @ParameterizedTest
    @ValueSource(strings = {"\"unterminated", "\"closed\"trailing"})
    void reportsMalformedCsvAtTheNextRecordAndKeepsEarlierValidationErrors(String brokenRecord) {
        // given
        Map<String, String> invalid = validRow("A\nmultiline", "주소");
        invalid.put("parking_operations.base_fee", "bad");
        String input = csv(List.of(invalid)) + brokenRecord;

        // when
        ParkingCsvException exception = parseFailure(input);

        // then
        assertThat(exception.getErrors()).extracting(ValidationErrorField::getField)
                .containsExactly("rows[2].parking_operations.base_fee", "rows[3]");
    }

    @Test
    void rejectsUnsupportedExtensionEncodingAndMissingFile() {
        // given
        byte[] invalidUtf8 = {(byte) 0xC3, (byte) 0x28};
        byte[] utf16 = csv(List.of(validRow("A", "주소"))).getBytes(StandardCharsets.UTF_16);

        // when & then
        assertThat(assertThrows(ParkingCsvException.class,
                () -> parseAndCollect(parser, file("parking.txt", new byte[0]))).getStatus())
                .isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        assertThat(assertThrows(ParkingCsvException.class,
                () -> parseAndCollect(parser, file("parking.csv", invalidUtf8))).getStatus())
                .isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        assertThat(assertThrows(ParkingCsvException.class,
                () -> parseAndCollect(parser, file("parking.csv", utf16))).getStatus())
                .isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        assertThat(assertThrows(ParkingCsvException.class, () -> parseAndCollect(parser, null)).getStatus())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    @DisplayName("정상 행을 읽은 뒤 8KiB보다 뒤에서 발견한 잘못된 UTF-8도 거절한다")
    void rejectsInvalidUtf8AfterValidRowsAndMultipleReadBuffers() throws IOException {
        // given
        Map<String, String> second = validRow("B", "두 번째 주소");
        second.put("parking_lots.id", "x".repeat(9000));
        byte[] bytes = withInvalidUtf8Suffix(csv(List.of(validRow("A", "주소"), second)));
        TrackingInputStream input = new TrackingInputStream(bytes, 257);
        MultipartFile file = streamedFile(input, bytes.length);

        // when
        ParkingCsvException exception = assertThrows(ParkingCsvException.class, () -> parseAndCollect(parser, file));

        // then
        assertThat(exception.getStatus()).isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        assertThat(exception.getMessage()).isEqualTo("UTF-8 또는 UTF-8 BOM 인코딩만 지원합니다.");
        assertThat(input.closed).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"header", "syntax"})
    @DisplayName("헤더나 CSV 구문 오류 뒤에서 발견한 인코딩 오류를 우선해서 반환한다")
    void prioritizesLateEncodingFailureOverEarlierCsvErrors(String errorType) throws IOException {
        // given
        byte[] bytes = withInvalidUtf8Suffix(validationFailureContent(errorType) + "x".repeat(9000));
        TrackingInputStream input = new TrackingInputStream(bytes, 257);
        MultipartFile file = streamedFile(input, bytes.length);

        // when
        ParkingCsvException exception = assertThrows(ParkingCsvException.class, () -> parseAndCollect(parser, file));

        // then
        assertThat(exception.getStatus()).isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        assertThat(input.closed).isTrue();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    @DisplayName("신고 크기보다 큰 실제 입력의 크기 초과는 헤더와 인코딩 오류보다 우선한다")
    void prioritizesActualSizeLimitOverHeaderAndEncodingErrors(boolean invalidEncoding) throws IOException {
        // given
        ParkingCsvParser smallLimitParser = new ParkingCsvParser("8KB");
        byte[] bytes = ("invalid,header\n" + "x".repeat(9000)).getBytes(StandardCharsets.UTF_8);
        if (invalidEncoding) {
            bytes[0] = (byte) 0xC3;
            bytes[1] = (byte) 0x28;
        }
        TrackingInputStream input = new TrackingInputStream(bytes, 257);
        MultipartFile file = streamedFile(input, 1);

        // when
        ParkingCsvException exception = assertThrows(ParkingCsvException.class, () -> parseAndCollect(smallLimitParser, file));

        // then
        assertThat(exception.getStatus()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(exception.getMessage()).isEqualTo("CSV 파일은 최대 8KiB까지 업로드할 수 있습니다.");
        assertThat(input.closed).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"header", "syntax", "value"})
    @DisplayName("헤더와 CSV 구문, 필드 검증에 실패해도 입력 스트림을 닫는다")
    void closesInputAfterValidationFailure(String errorType) throws IOException {
        // given
        byte[] bytes = validationFailureContent(errorType).getBytes(StandardCharsets.UTF_8);
        TrackingInputStream input = new TrackingInputStream(bytes, 257);
        MultipartFile file = streamedFile(input, bytes.length);

        // when
        ParkingCsvException exception = assertThrows(ParkingCsvException.class, () -> parseAndCollect(parser, file));

        // then
        assertThat(exception.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(input.closed).isTrue();
    }

    @Test
    void rejectsActualOversizeStreamEvenIfReportedSizeIsSmaller() throws IOException {
        // given
        ParkingCsvParser smallLimitParser = new ParkingCsvParser("8KB");
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("parking.csv");
        when(file.getSize()).thenReturn(1L);
        when(file.getInputStream()).thenReturn(new ByteArrayInputStream(new byte[8193]));

        // when
        ParkingCsvException exception = assertThrows(ParkingCsvException.class, () -> parseAndCollect(smallLimitParser, file));

        // then
        assertThat(exception.getStatus()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(exception.getMessage()).isEqualTo("CSV 파일은 최대 8KiB까지 업로드할 수 있습니다.");
    }

    @Test
    void preservesOriginalReadFailureWithoutExposingItsMessage() throws IOException {
        // given
        MultipartFile file = mock(MultipartFile.class);
        IOException cause = new IOException("internal storage failure");
        when(file.getOriginalFilename()).thenReturn("parking.csv");
        when(file.getInputStream()).thenThrow(cause);

        // when
        ParkingCsvException exception = assertThrows(ParkingCsvException.class, () -> parseAndCollect(parser, file));

        // then
        assertThat(exception.getStatus()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(exception).hasCause(cause).hasMessage("업로드한 파일을 읽을 수 없습니다.");
        assertThat(exception.getErrors()).isEmpty();
    }

    @Test
    @DisplayName("입력을 읽는 도중 발생한 입출력 오류의 원인을 유지하고 스트림을 닫는다")
    void preservesMidstreamReadFailureAndClosesInput() throws IOException {
        // given
        Map<String, String> row = validRow("B", "두 번째 주소");
        row.put("parking_lots.id", "x".repeat(9000));
        byte[] bytes = csv(List.of(validRow("A", "주소"), row)).getBytes(StandardCharsets.UTF_8);
        IOException cause = new IOException("internal storage failure");
        TrackingInputStream input = new TrackingInputStream(bytes, 257, 8500, cause);
        MultipartFile file = streamedFile(input, bytes.length);

        // when
        ParkingCsvException exception = assertThrows(ParkingCsvException.class, () -> parseAndCollect(parser, file));

        // then
        assertThat(exception.getStatus()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(exception).hasCause(cause).hasMessage("업로드한 파일을 읽을 수 없습니다.");
        assertThat(exception.getErrors()).isEmpty();
        assertThat(input.closed).isTrue();
    }

    @ParameterizedTest
    @CsvSource({"10MB, 10MiB", "8KB, 8KiB", "8193B, 8193바이트"})
    void enforcesConfiguredLimitAndReportsItWithoutRounding(String configuredLimit, String displayedLimit) {
        // given
        ParkingCsvParser configuredParser = new ParkingCsvParser(configuredLimit);
        int maxFileSizeBytes = Math.toIntExact(DataSize.parse(configuredLimit).toBytes());
        Map<String, String> row = validRow("A", "주소");
        int baseSize = csv(List.of(row)).getBytes(StandardCharsets.UTF_8).length;
        row.put("parking_lots.id", "x".repeat(maxFileSizeBytes - baseSize));
        byte[] exactLimit = csv(List.of(row)).getBytes(StandardCharsets.UTF_8);
        MultipartFile oversized = file("parking.csv", new byte[maxFileSizeBytes + 1]);

        // when
        ParkingCsvFile result = parseAndCollect(configuredParser, file("parking.csv", exactLimit));
        ParkingCsvException exception = assertThrows(ParkingCsvException.class,
                () -> parseAndCollect(configuredParser, oversized));

        // then
        assertThat(exactLimit).hasSize(maxFileSizeBytes);
        assertThat(result.rows()).hasSize(1);
        assertThat(exception.getStatus()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(exception.getMessage()).isEqualTo("CSV 파일은 최대 " + displayedLimit + "까지 업로드할 수 있습니다.");
    }

    @ParameterizedTest
    @ValueSource(strings = {"0B", "-1B", "2147483647B", "2GB"})
    void rejectsUnsupportedConfiguredSizeLimits(String configuredLimit) {
        // when & then
        assertThrows(IllegalArgumentException.class, () -> new ParkingCsvParser(configuredLimit));
    }

    private ParkingCsvException parseFailure(String csv) {
        return assertThrows(ParkingCsvException.class, () -> parseAndCollect(parser, file(csv)));
    }

    private MockMultipartFile file(String content) {
        return file("parking.csv", content.getBytes(StandardCharsets.UTF_8));
    }

    private MockMultipartFile file(String name, byte[] content) {
        return new MockMultipartFile("file", name, "text/csv", content);
    }

    private MultipartFile streamedFile(InputStream input, long reportedSize) throws IOException {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("parking.csv");
        when(file.getSize()).thenReturn(reportedSize);
        when(file.getInputStream()).thenReturn(input);
        return file;
    }

    private byte[] withInvalidUtf8Suffix(String content) {
        byte[] prefix = content.getBytes(StandardCharsets.UTF_8);
        byte[] bytes = Arrays.copyOf(prefix, prefix.length + 2);
        bytes[prefix.length] = (byte) 0xC3;
        bytes[prefix.length + 1] = (byte) 0x28;
        return bytes;
    }

    private String validationFailureContent(String errorType) {
        if (errorType.equals("header")) {
            return "invalid,header\n";
        }
        if (errorType.equals("syntax")) {
            return csv(List.of(validRow("A", "주소"))) + "\"closed\"trailing\n";
        }
        Map<String, String> row = validRow("A", "주소");
        row.put("parking_operations.base_fee", "invalid");
        return csv(List.of(row));
    }

    @ParameterizedTest
    @CsvSource({
            "base_free_minutes, 30",
            "base_minutes, 10",
            "base_fee, 1000",
            "additional_minutes, 15",
            "additional_fee, 500",
            "daily_max_fee, 20000",
            "monthly_fee, 100000",
            "weekday_paid, true",
            "saturday_paid, false",
            "holiday_paid, true",
            "weekday_status, OPEN",
            "weekday_open_time, 09:10",
            "weekday_close_time, 19:20",
            "weekend_status, OPEN",
            "weekend_open_time, 10:20",
            "weekend_close_time, 20:30",
            "holiday_status, OPEN",
            "holiday_open_time, 11:30",
            "holiday_close_time, 21:40",
            "source_checked_at, 2026-09-29T18:42:55+09:00"
    })
    @DisplayName("연속 행의 운영 정보가 달라지거나 돌아와도 앞선 행의 값과 독립적으로 파싱한다")
    void preservesEveryOperationFieldAcrossRepeatedAndChangedRows(String column, String changedValue) {
        // given
        Map<String, String> original = validRow("A", "주소 A");
        Map<String, String> changed = validRow("B", "주소 B");
        changed.put("parking_operations." + column, changedValue);
        Map<String, String> restored = validRow("C", "주소 C");
        ParkingCsvRow originalAlone = parseAndCollect(parser, file(csv(List.of(original)))).rows().getFirst();
        ParkingCsvRow changedAlone = parseAndCollect(parser, file(csv(List.of(changed)))).rows().getFirst();

        // when
        List<ParkingCsvRow> rows = parseAndCollect(parser, file(csv(List.of(original, changed, restored)))).rows();

        // then
        assertThat(rows.get(0).operation()).isEqualTo(originalAlone.operation());
        assertThat(rows.get(1).operation()).isEqualTo(changedAlone.operation());
        assertThat(rows.get(1).operation()).isNotEqualTo(originalAlone.operation());
        assertThat(rows.get(2).operation()).isEqualTo(originalAlone.operation());
    }

    @ParameterizedTest
    @ValueSource(strings = {"parking_lots.id", "parking_lots.created_at", "parking_lots.updated_at",
            "parking_operations.parking_lot_id", "parking_operations.created_at", "parking_operations.updated_at"})
    @DisplayName("무시하는 열의 큰 인용 필드와 여러 줄을 읽어도 행 번호와 원본 해시를 유지한다")
    void preservesRowsAndHashForLargeQuotedIgnoredFields(String column) throws Exception {
        // given
        Map<String, String> first = validRow("A", "주소 A");
        first.put(column, "한글, \"인용\"\r\n".repeat(2_000));
        List<String> headers = new ArrayList<>(ParkingCsvColumn.headers());
        Collections.reverse(headers);
        byte[] bytes = ("\uFEFF" + csv(headers, List.of(first, validRow("B", "주소 B"))))
                .getBytes(StandardCharsets.UTF_8);
        TrackingInputStream input = new TrackingInputStream(bytes, 17);

        // when
        ParkingCsvFile result = parseAndCollect(parser, streamedFile(input, bytes.length));

        // then
        assertThat(result.fileSha256()).isEqualTo(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)));
        assertThat(result.rows()).extracting(ParkingCsvRow::rowNumber).containsExactly(2L, 3L);
        assertThat(result.rows()).extracting(row -> row.lot().name()).containsExactly("A", "B");
        assertThat(result.rows()).extracting(row -> row.lot().address()).containsExactly("주소 A", "주소 B");
        assertThat(input.closed).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"parking_lots.id", "parking_lots.created_at", "parking_lots.updated_at",
            "parking_operations.parking_lot_id", "parking_operations.created_at", "parking_operations.updated_at"})
    @DisplayName("무시하는 열 안의 잘못된 UTF-8도 인코딩 오류로 거절한다")
    void rejectsMalformedUtf8InsideIgnoredFields(String column) throws IOException {
        // given
        Map<String, String> row = validRow("A", "주소 A");
        String marker = "INVALID_UTF8_HERE";
        row.put(column, "x".repeat(9_000) + ",\n" + marker + "\n\"ignored");
        String content = csv(List.of(row));
        int markerIndex = content.indexOf(marker);
        byte[] prefix = content.substring(0, markerIndex).getBytes(StandardCharsets.UTF_8);
        byte[] suffix = content.substring(markerIndex + marker.length()).getBytes(StandardCharsets.UTF_8);
        byte[] bytes = Arrays.copyOf(prefix, prefix.length + 2 + suffix.length);
        bytes[prefix.length] = (byte) 0xC3;
        bytes[prefix.length + 1] = (byte) 0x28;
        System.arraycopy(suffix, 0, bytes, prefix.length + 2, suffix.length);
        TrackingInputStream input = new TrackingInputStream(bytes, 257);
        MultipartFile file = streamedFile(input, bytes.length);

        // when
        ParkingCsvException exception = assertThrows(ParkingCsvException.class, () -> parseAndCollect(parser, file));

        // then
        assertThat(exception.getStatus()).isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        assertThat(exception.getMessage()).isEqualTo("UTF-8 또는 UTF-8 BOM 인코딩만 지원합니다.");
        assertThat(input.closed).isTrue();
    }

    @Test
    @DisplayName("많은 초과 열이 있는 행 뒤 정상 행도 행 번호와 중복 오류 순서를 유지한다")
    void preservesRecordsAfterRowWithManyExtraColumns() {
        // given
        String[] lines = csv(List.of(validRow("A", "주소 A"), validRow("B", "주소 B"),
                validRow("A", "주소 A"), validRow("B", "주소 B"))).split("\n", -1);
        lines[1] = lines[1] + ",extra".repeat(100);
        String input = String.join("\n", lines);
        RecordingRowSink sink = new RecordingRowSink();
        sink.duplicateRowNumbers = List.of(2L, 4L, 3L, 5L);

        // when
        ParkingCsvException collecting = parseFailure(input);
        ParkingCsvException streaming = assertThrows(ParkingCsvException.class, () -> parser.parse(file(input), sink));

        // then
        assertThat(sink.keys).extracting(ParkingCsvKey::rowNumber).containsExactly(2L, 3L, 4L, 5L);
        assertThat(sink.rows).extracting(ParkingCsvRow::rowNumber).containsExactly(3L, 4L, 5L);
        assertThat(sink.rows).extracting(row -> row.lot().name()).containsExactly("B", "A", "B");
        assertThat(collecting.getErrors()).extracting(ValidationErrorField::getField).containsExactly(
                "rows[2]", "rows[2].parking_lots.name", "rows[4].parking_lots.name",
                "rows[3].parking_lots.name", "rows[5].parking_lots.name");
        assertThat(streaming.getErrors()).extracting(ValidationErrorField::getField)
                .containsExactlyElementsOf(collecting.getErrors().stream().map(ValidationErrorField::getField).toList());
    }

    private Map<String, String> validRow(String name, String address) {
        Map<String, String> row = new LinkedHashMap<>();
        ParkingCsvColumn.headers().forEach(header -> row.put(header, ""));
        row.put("parking_lots.source", "SEOUL_PARKING_SITE");
        row.put("parking_lots.source_external_id", "source-1");
        row.put("parking_lots.name", name);
        row.put("parking_lots.address", address);
        row.put("parking_lots.active", "true");
        row.put("parking_lots.source_checked_at", "2026-09-28T18:42:55+09:00");
        row.put("parking_operations.source_checked_at", "2026-09-28T18:42:55+09:00");
        return row;
    }

    private List<Integer> integerValues(ParkingCsvRow row) {
        return Arrays.asList(row.lot().capacity(), row.operation().baseFreeMinutes(), row.operation().baseMinutes(),
                row.operation().baseFee(), row.operation().additionalMinutes(), row.operation().additionalFee(),
                row.operation().dailyMaxFee(), row.operation().monthlyFee());
    }

    private String csv(List<Map<String, String>> rows) {
        return csv(ParkingCsvColumn.headers(), rows);
    }

    private String csv(List<String> headers, List<Map<String, String>> rows) {
        StringBuilder csv = new StringBuilder(String.join(",", headers)).append('\n');
        for (Map<String, String> row : rows) {
            csv.append(headers.stream()
                    .map(header -> escape(row.getOrDefault(header, "")))
                    .collect(Collectors.joining(",")));
            csv.append('\n');
        }
        return csv.toString();
    }

    private String escape(String value) {
        if (value.contains(",") || value.contains("\"") || value.contains("\n") || value.contains("\r")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }

    private static final class RecordingRowSink implements ParkingCsvRowSink {

        private final List<ParkingCsvRow> rows = new ArrayList<>();
        private final List<ParkingCsvKey> keys = new ArrayList<>();
        private TrackingInputStream source;
        private int firstRowReadPosition;
        private List<Long> duplicateRowNumbers = List.of();
        private RuntimeException acceptFailure;

        @Override
        public void accept(ParkingCsvRow row) {
            if (acceptFailure != null) {
                throw acceptFailure;
            }
            if (source != null && rows.isEmpty()) {
                firstRowReadPosition = source.position;
            }
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
            return duplicateRowNumbers;
        }
    }

    private static final class TrackingInputStream extends InputStream {

        private final byte[] bytes;
        private final int chunkSize;
        private final int failureAt;
        private final IOException failure;
        private int position;
        private boolean closed;

        private TrackingInputStream(byte[] bytes, int chunkSize) {
            this(bytes, chunkSize, -1, null);
        }

        private TrackingInputStream(byte[] bytes, int chunkSize, int failureAt, IOException failure) {
            this.bytes = bytes;
            this.chunkSize = chunkSize;
            this.failureAt = failureAt;
            this.failure = failure;
        }

        @Override
        public int read() throws IOException {
            failIfNeeded();
            if (position >= bytes.length) {
                return -1;
            }
            return Byte.toUnsignedInt(bytes[position++]);
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            if (length == 0) {
                return 0;
            }
            failIfNeeded();
            if (position >= bytes.length) {
                return -1;
            }
            int size = Math.min(Math.min(length, chunkSize), bytes.length - position);
            if (failureAt >= 0) {
                size = Math.min(size, failureAt - position);
            }
            System.arraycopy(bytes, position, buffer, offset, size);
            position += size;
            return size;
        }

        private void failIfNeeded() throws IOException {
            if (failureAt >= 0 && position >= failureAt) {
                throw failure;
            }
        }

        @Override
        public void close() {
            closed = true;
        }
    }
}
