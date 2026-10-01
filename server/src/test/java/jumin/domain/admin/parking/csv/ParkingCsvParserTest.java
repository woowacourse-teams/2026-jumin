package jumin.domain.admin.parking.csv;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import jumin.domain.admin.parking.exception.ParkingCsvException;
import jumin.domain.admin.parking.model.ParkingCsvFile;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.domain.parking.entity.ParkingDataSource;
import jumin.domain.parking.entity.ParkingOperationStatus;
import jumin.global.response.ValidationErrorField;
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
        ParkingCsvFile result = parser.parse(file("parking.CSV", bytes));

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
        ParkingCsvRow parsedFirst = parser.parse(file(csv(List.of(first)))).rows().getFirst();
        ParkingCsvRow parsedSecond = parser.parse(file(csv(List.of(second)))).rows().getFirst();

        // then
        assertThat(parsedFirst.lot()).isEqualTo(parsedSecond.lot());
        assertThat(parsedFirst.operation()).isEqualTo(parsedSecond.operation());
        assertThat(parsedFirst.lot().sourceCheckedAt()).isEqualTo(Instant.parse("2026-09-28T09:42:55Z"));
    }

    @Test
    void allowsOpenWithoutTimesAndPreservesOpenStatus() {
        // given
        Map<String, String> row = validRow("A", "주소");
        row.put("parking_operations.weekday_status", "OPEN");

        // when
        ParkingCsvRow result = parser.parse(file(csv(List.of(row)))).rows().getFirst();

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
        ParkingCsvRow result = parser.parse(file(csv(List.of(row)))).rows().getFirst();

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
        ParkingCsvFile result = parser.parse(file(csv(List.of(first, second, third))));

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
        List<ParkingCsvRow> rows = parser.parse(file(csv(List.of(first, second)))).rows();

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
        ParkingCsvRow parsed = parser.parse(file(csv(List.of(row)))).rows().getFirst();

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
        ParkingCsvFile result = parser.parse(file(csv(List.of(valid))));
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
        assertThat(assertThrows(ParkingCsvException.class, () -> parser.parse(file("parking.txt", new byte[0]))).getStatus())
                .isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        assertThat(assertThrows(ParkingCsvException.class, () -> parser.parse(file("parking.csv", invalidUtf8))).getStatus())
                .isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        assertThat(assertThrows(ParkingCsvException.class, () -> parser.parse(file("parking.csv", utf16))).getStatus())
                .isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        assertThat(assertThrows(ParkingCsvException.class, () -> parser.parse(null)).getStatus())
                .isEqualTo(HttpStatus.BAD_REQUEST);
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
        ParkingCsvException exception = assertThrows(ParkingCsvException.class, () -> smallLimitParser.parse(file));

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
        ParkingCsvException exception = assertThrows(ParkingCsvException.class, () -> parser.parse(file));

        // then
        assertThat(exception.getStatus()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(exception).hasCause(cause).hasMessage("업로드한 파일을 읽을 수 없습니다.");
        assertThat(exception.getErrors()).isEmpty();
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
        ParkingCsvFile result = configuredParser.parse(file("parking.csv", exactLimit));
        ParkingCsvException exception = assertThrows(ParkingCsvException.class, () -> configuredParser.parse(oversized));

        // then
        assertThat(exactLimit).hasSize(maxFileSizeBytes);
        assertThat(result.rows()).hasSize(1);
        assertThat(exception.getStatus()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(exception.getMessage()).isEqualTo("CSV 파일은 최대 " + displayedLimit + "까지 업로드할 수 있습니다.");
    }

    @ParameterizedTest
    @ValueSource(strings = {"0B", "-1B", "2147483647B", "2GB"})
    void rejectsLimitsThatCannotBeReadWithABoundedByteArray(String configuredLimit) {
        // when & then
        assertThrows(IllegalArgumentException.class, () -> new ParkingCsvParser(configuredLimit));
    }

    private ParkingCsvException parseFailure(String csv) {
        return assertThrows(ParkingCsvException.class, () -> parser.parse(file(csv)));
    }

    private MockMultipartFile file(String content) {
        return file("parking.csv", content.getBytes(StandardCharsets.UTF_8));
    }

    private MockMultipartFile file(String name, byte[] content) {
        return new MockMultipartFile("file", name, "text/csv", content);
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
}
