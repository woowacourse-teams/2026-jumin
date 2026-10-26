package jumin.domain.admin.parking.csv;

import static jumin.domain.admin.parking.csv.ParkingCsvParserTestSupport.parseAndCollect;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import jumin.domain.admin.parking.exception.ParkingCsvException;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.global.response.ValidationErrorField;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;

class ParkingCsvTemporalParsingTest {

    private final ParkingCsvParser parser = new ParkingCsvParser("10MB");

    @ParameterizedTest
    @ValueSource(strings = {
            "2026-09-28T18:42:55+09:00", "2000-02-29T23:59:59Z", "1900-02-28T00:00:00-18:00",
            "0000-02-29T00:00:00+18:00", "9999-12-31T23:59:59-18:00",
            "2026-09-28T18:42:55.1+09:00", "2026-09-28T18:42:55.123Z",
            "2026-09-28T18:42:55.123456-00:30", "2026-09-28T18:42:55.123456000+00:00",
            "2026-09-28T18:42:55.0000010-00:00", "2026-09-28T18:42:55+17:59",
            "2026-09-28T18:42:55-17:59", "2026-09-28t18:42:55z", "2026-09-28T18:42+09:00",
            "2026-09-28T18:42Z", "0000-02-29T00:00-18:00", "9999-12-31T23:59+18:00",
            "2026-09-28T18:42-00:30", "2026-09-28T18:42-00:00", "2026-09-28T18:42+09:00:01",
            "2026-09-28T18:42:55+09:00:01", "2026-09-28T18:42:55.123456+09:30:15",
            "+10000-01-01T00:00:00Z", "-0001-12-31T23:59:59Z",
            "-4713-11-24T00:00:00Z", "+294276-12-31T23:59:59.999999Z"
    })
    @DisplayName("일반 시각과 기존 ISO 대체 형식의 결과가 Java 오프셋 시각 파서와 같다")
    void preserves_timestamp_formats_and_offset_semantics(String timestamp) {
        // given
        Instant expected = OffsetDateTime.parse(timestamp).toInstant();

        // when
        ParkingCsvRow parsed = parse(timestamp, "09:01:02");

        // then
        assertThat(parsed.lot().sourceCheckedAt()).isEqualTo(expected);
        assertThat(parsed.operation().sourceCheckedAt()).isEqualTo(expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "2026-02-29T09:00:00Z", "1900-02-29T09:00:00Z", "2026-04-31T09:00:00Z",
            "2026-00-01T09:00:00Z", "2026-13-01T09:00:00Z", "2026-01-00T09:00:00Z",
            "2026-01-32T09:00:00Z", "2026-09-28T24:00:00Z", "2026-09-28T09:60:00Z",
            "2026-09-28T09:00:60Z", "2026-09-28T09:00:00+18:01", "2026-09-28T09:00:00-18:01",
            "2026-09-28T09:00:00+19:00", "2026-09-28T09:00:00+09:60",
            "2026-09-28T09:00:00+0９:00", "２０２６-09-28T09:00:00Z",
            "2026-09-28T09:00:00.1234567890Z", "2026-09-28T09:00:00",
            "2026-09-28T09:00:00.123456", "2026-09-28T09:00:00Zsuffix",
            "2026-09-28T24:00Z", "2026-09-28T09:60Z", "2026-09-28T09:00+18:01",
            "2026-09-28T09:00-18:01", "2026-02-29T09:00Z", "2026-09-28T09:00.123Z",
            "2026-09-28T09:00:", "2026-09-28T09:00:0Z", "2026-09-28T09:00"
    })
    @DisplayName("달력 날짜와 시각, 오프셋이 잘못되면 기존 필드 오류를 반환한다")
    void rejects_invalid_timestamp_components(String timestamp) {
        // given
        MockMultipartFile file = file(List.<String[]>of(dataRow(0, timestamp, "09:01")));

        // when
        ParkingCsvException failure = assertThrows(ParkingCsvException.class, () -> parseAndCollect(parser, file));

        // then
        assertThat(failure.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(failure.getErrors()).extracting(ValidationErrorField::getField).containsExactly(
                "rows[2].parking_lots.source_checked_at", "rows[2].parking_operations.source_checked_at"
        );
        assertThat(failure.getErrors()).extracting(ValidationErrorField::getMessage)
                .containsOnly("시간대 오프셋을 포함한 ISO 8601 시각이어야 합니다.");
    }

    @ParameterizedTest
    @ValueSource(strings = {"2026-09-28T09:00:00.1234567+09:00", "2026-09-28T09:00:00.000000001Z"})
    @DisplayName("마이크로초보다 세밀한 시각이면 기존 정밀도 오류를 반환한다")
    void rejects_sub_microsecond_timestamp_values(String timestamp) {
        // given
        MockMultipartFile file = file(List.<String[]>of(dataRow(0, timestamp, "09:01")));

        // when
        ParkingCsvException failure = assertThrows(ParkingCsvException.class, () -> parseAndCollect(parser, file));

        // then
        assertThat(failure.getErrors()).hasSize(2).extracting(ValidationErrorField::getMessage)
                .containsOnly("DB에 정확히 저장할 수 있도록 소수 초는 마이크로초(6자리) 정밀도여야 합니다.");
    }

    @ParameterizedTest
    @ValueSource(strings = {"00:00", "00:00:00", "09:01", "09:01:02", "23:59", "23:59:59"})
    @DisplayName("운영 시각의 분과 초 형식을 그대로 보존한다")
    void preserves_supported_time_formats(String time) {
        // when
        ParkingCsvRow parsed = parse("2026-09-28T09:00:00Z", time);

        // then
        assertThat(parsed.operation().weekday().openTime()).isEqualTo(LocalTime.parse(time));
    }

    @ParameterizedTest
    @ValueSource(strings = {"24:00", "23:60", "23:59:60", "9:01", "09:1", "09:01:2", "０９:01",
            "09:01:02.1", "09:01+09:00", "+9:01", "09:01:02Z", "09:01: 2", "-1:01"})
    @DisplayName("운영 시각은 ASCII 두 자리 시분초와 유효한 범위만 허용한다")
    void rejects_unsupported_time_shapes_and_ranges(String time) {
        // given
        MockMultipartFile file = file(List.<String[]>of(dataRow(0, "2026-09-28T09:00:00Z", time)));

        // when
        ParkingCsvException failure = assertThrows(ParkingCsvException.class, () -> parseAndCollect(parser, file));

        // then
        assertThat(failure.getErrors()).extracting(ValidationErrorField::getField)
                .containsExactly("rows[2].parking_operations.weekday_open_time");
        assertThat(failure.getErrors()).extracting(ValidationErrorField::getMessage)
                .containsExactly("HH:mm 또는 HH:mm:ss 형식의 유효한 시간이어야 합니다.");
    }

    @Test
    @DisplayName("행마다 날짜와 오프셋, 소수초가 달라도 ISO 변환 결과와 같은 값을 유지한다")
    void preserves_varying_dates_offsets_and_precision_across_rows() {
        // given
        List<String[]> rows = new ArrayList<>();
        List<Instant> expected = new ArrayList<>();
        for (int index = 0; index < 180; index++) {
            int year = List.of(0, 1900, 2000, 2024, 9999).get(index % 5);
            int month = index % 12 + 1;
            LocalDate date = LocalDate.of(year, month, 1);
            date = date.withDayOfMonth(index % date.lengthOfMonth() + 1);
            LocalTime time = LocalTime.of(index % 24, index % 60, index * 7 % 60, index * 1_001_000);
            ZoneOffset offset = ZoneOffset.ofTotalSeconds((index * 17 % 2161 - 1080) * 60);
            OffsetDateTime timestamp = OffsetDateTime.of(date, time, offset);
            rows.add(dataRow(index, timestamp.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME), "09:01"));
            expected.add(timestamp.toInstant());
        }
        MockMultipartFile file = file(rows);

        // when
        List<ParkingCsvRow> parsed = parseAndCollect(parser, file).rows();

        // then
        assertThat(parsed).hasSize(expected.size());
        for (int index = 0; index < parsed.size(); index++) {
            assertThat(parsed.get(index).lot().sourceCheckedAt()).isEqualTo(expected.get(index));
            assertThat(parsed.get(index).operation().sourceCheckedAt()).isEqualTo(expected.get(index));
        }
    }

    private ParkingCsvRow parse(String timestamp, String time) {
        return parseAndCollect(parser, file(List.<String[]>of(dataRow(0, timestamp, time)))).rows().getFirst();
    }

    private String[] dataRow(int index, String timestamp, String time) {
        String[] values = new String[ParkingCsvColumn.values().length];
        Arrays.fill(values, "");
        values[ParkingCsvColumn.SOURCE.ordinal()] = "DATA_GO_KR";
        values[ParkingCsvColumn.SOURCE_EXTERNAL_ID.ordinal()] = "time-" + index;
        values[ParkingCsvColumn.NAME.ordinal()] = "시간 검증 " + index;
        values[ParkingCsvColumn.ADDRESS.ordinal()] = "주소 " + index;
        values[ParkingCsvColumn.ACTIVE.ordinal()] = "true";
        values[ParkingCsvColumn.LOT_SOURCE_CHECKED_AT.ordinal()] = timestamp;
        values[ParkingCsvColumn.OPERATION_SOURCE_CHECKED_AT.ordinal()] = timestamp;
        values[ParkingCsvColumn.WEEKDAY_OPEN_TIME.ordinal()] = time;
        return values;
    }

    private MockMultipartFile file(List<String[]> rows) {
        StringBuilder csv = new StringBuilder(String.join(",", ParkingCsvColumn.headers())).append('\n');
        for (String[] row : rows) {
            csv.append(String.join(",", row)).append('\n');
        }
        return new MockMultipartFile("file", "times.csv", "text/csv", csv.toString().getBytes(StandardCharsets.UTF_8));
    }
}
