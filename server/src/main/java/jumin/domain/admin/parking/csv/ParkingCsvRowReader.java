package jumin.domain.admin.parking.csv;

import static jumin.domain.admin.parking.csv.ParkingCsvColumn.*;

import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.format.ResolverStyle;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.domain.admin.parking.model.ParkingLotValues;
import jumin.domain.admin.parking.model.ParkingOperationValues;
import jumin.domain.admin.parking.model.ParkingScheduleValues;
import jumin.domain.admin.parking.support.ParkingText;
import jumin.domain.parking.entity.ParkingDataSource;
import jumin.domain.parking.entity.ParkingOperationStatus;
import jumin.global.response.ValidationErrorField;
import org.apache.commons.csv.CSVRecord;

final class ParkingCsvRowReader {

    private static final Pattern INTEGER = Pattern.compile("[0-9]+");
    private static final Pattern DECIMAL = Pattern.compile("[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?");
    private static final Pattern TIME = Pattern.compile("[0-9]{2}:[0-9]{2}(?::[0-9]{2})?");
    // PostgreSQL timestamp.h의 MIN_TIMESTAMP 이상, END_TIMESTAMP 미만 범위다.
    private static final Instant MIN_DB_TIMESTAMP = Instant.parse("-4713-11-24T00:00:00Z");
    private static final Instant MAX_DB_TIMESTAMP_EXCLUSIVE = Instant.parse("+294277-01-01T00:00:00Z");
    private static final DateTimeFormatter TIME_FORMAT = new DateTimeFormatterBuilder()
            .appendPattern("HH:mm")
            .optionalStart()
            .appendPattern(":ss")
            .optionalEnd()
            .toFormatter()
            .withResolverStyle(ResolverStyle.STRICT);

    private final CSVRecord record;
    private final Map<ParkingCsvColumn, Integer> indexes;
    private final List<ValidationErrorField> errors;

    ParkingCsvRowReader(CSVRecord record, Map<ParkingCsvColumn, Integer> indexes,
            List<ValidationErrorField> errors) {
        this.record = record;
        this.indexes = indexes;
        this.errors = errors;
    }

    ParkingCsvRow read() {
        int errorCount = errors.size();
        ParkingDataSource source = enumValue(SOURCE, ParkingDataSource.class, true);
        String externalId = text(SOURCE_EXTERNAL_ID, 40, true);
        String name = text(NAME, 100, true);
        String sido = text(SIDO, 30, false);
        String sigungu = text(SIGUNGU, 30, false);
        String address = text(ADDRESS, 255, true);
        Double latitude = coordinate(LATITUDE, -90, 90);
        Double longitude = coordinate(LONGITUDE, -180, 180);
        Integer capacity = nonNegativeInteger(CAPACITY);
        Boolean active = bool(ACTIVE, true);
        Instant lotCheckedAt = instant(LOT_SOURCE_CHECKED_AT);
        ParkingOperationValues operation = new ParkingOperationValues(
                nonNegativeInteger(BASE_FREE_MINUTES), nonNegativeInteger(BASE_MINUTES),
                nonNegativeInteger(BASE_FEE), nonNegativeInteger(ADDITIONAL_MINUTES),
                nonNegativeInteger(ADDITIONAL_FEE), nonNegativeInteger(DAILY_MAX_FEE),
                nonNegativeInteger(MONTHLY_FEE), bool(WEEKDAY_PAID, false),
                bool(SATURDAY_PAID, false), bool(HOLIDAY_PAID, false),
                schedule(WEEKDAY_STATUS, WEEKDAY_OPEN_TIME, WEEKDAY_CLOSE_TIME),
                schedule(WEEKEND_STATUS, WEEKEND_OPEN_TIME, WEEKEND_CLOSE_TIME),
                schedule(HOLIDAY_STATUS, HOLIDAY_OPEN_TIME, HOLIDAY_CLOSE_TIME),
                instant(OPERATION_SOURCE_CHECKED_AT));

        if (errors.size() != errorCount) {
            return null;
        }
        ParkingLotValues lot = new ParkingLotValues(source, externalId, name, sido, sigungu,
                address, latitude, longitude, capacity, active, lotCheckedAt);
        return new ParkingCsvRow(record.getRecordNumber(), lot, operation);
    }

    private ParkingScheduleValues schedule(ParkingCsvColumn statusColumn,
            ParkingCsvColumn openColumn, ParkingCsvColumn closeColumn) {
        return new ParkingScheduleValues(enumValue(statusColumn, ParkingOperationStatus.class, false),
                time(openColumn), time(closeColumn));
    }

    private String text(ParkingCsvColumn column, int maxLength, boolean required) {
        String value = value(column, required);
        if (value != null && value.codePointCount(0, value.length()) > maxLength) {
            error(column, maxLength + "자 이하여야 합니다.");
        }
        return value;
    }

    private <E extends Enum<E>> E enumValue(ParkingCsvColumn column, Class<E> enumType, boolean required) {
        String value = value(column, required);
        if (value == null) {
            return null;
        }
        try {
            return Enum.valueOf(enumType, value);
        } catch (IllegalArgumentException exception) {
            error(column, "허용되지 않는 값입니다.");
            return null;
        }
    }

    private Boolean bool(ParkingCsvColumn column, boolean required) {
        String value = value(column, required);
        if (value == null) {
            return null;
        }
        if (value.equals("true")) {
            return true;
        }
        if (value.equals("false")) {
            return false;
        }
        error(column, "true 또는 false여야 합니다.");
        return null;
    }

    private Integer nonNegativeInteger(ParkingCsvColumn column) {
        String value = value(column, false);
        if (value == null) {
            return null;
        }
        try {
            if (INTEGER.matcher(value).matches()) {
                return Integer.valueOf(value);
            }
        } catch (NumberFormatException exception) {
            // 정수 범위를 넘는 값도 해당 열의 검증 오류로 수집한다.
        }
        error(column, "0 이상 2147483647 이하의 정수여야 합니다.");
        return null;
    }

    private Double coordinate(ParkingCsvColumn column, int min, int max) {
        String value = value(column, false);
        if (value == null) {
            return null;
        }
        try {
            if (DECIMAL.matcher(value).matches()) {
                double number = Double.parseDouble(value);
                if (Double.isFinite(number) && number >= min && number <= max) {
                    if (number == 0.0) {
                        return 0.0;
                    }
                    return number;
                }
            }
        } catch (NumberFormatException exception) {
            // 숫자로 변환할 수 없는 값도 다른 열과 함께 반환한다.
        }
        error(column, min + " 이상 " + max + " 이하의 유한한 숫자여야 합니다.");
        return null;
    }

    private LocalTime time(ParkingCsvColumn column) {
        String value = value(column, false);
        if (value == null) {
            return null;
        }
        try {
            if (TIME.matcher(value).matches()) {
                return LocalTime.parse(value, TIME_FORMAT);
            }
        } catch (DateTimeException exception) {
            // 상태와 시간의 조합은 검사하지 않고 입력된 시간만 검사한다.
        }
        error(column, "HH:mm 또는 HH:mm:ss 형식의 유효한 시간이어야 합니다.");
        return null;
    }

    private Instant instant(ParkingCsvColumn column) {
        String value = value(column, true);
        if (value == null) {
            return null;
        }
        try {
            Instant result = OffsetDateTime.parse(value).toInstant();
            if (result.isBefore(MIN_DB_TIMESTAMP) || !result.isBefore(MAX_DB_TIMESTAMP_EXCLUSIVE)) {
                error(column, "PostgreSQL에 저장할 수 있는 시각 범위를 벗어났습니다.");
                return null;
            }
            if (result.getNano() % 1_000 != 0) {
                error(column, "DB에 정확히 저장할 수 있도록 소수 초는 마이크로초(6자리) 정밀도여야 합니다.");
                return null;
            }
            return result;
        } catch (DateTimeException exception) {
            error(column, "시간대 오프셋을 포함한 ISO 8601 시각이어야 합니다.");
            return null;
        }
    }

    private String value(ParkingCsvColumn column, boolean required) {
        String value = ParkingText.trimSpaces(record.get(indexes.get(column)));
        if (value.isEmpty()) {
            if (required) {
                error(column, "필수 값입니다.");
            }
            return null;
        }
        if (value.indexOf('\0') >= 0) {
            error(column, "NUL 문자는 허용하지 않습니다.");
            return null;
        }
        return value;
    }

    private void error(ParkingCsvColumn column, String message) {
        errors.add(ValidationErrorField.of("rows[" + record.getRecordNumber() + "]." + column.header(), message));
    }
}
