package jumin.domain.admin.parking.csv;

import static jumin.domain.admin.parking.csv.ParkingCsvColumn.*;

import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.domain.admin.parking.model.ParkingLotValues;
import jumin.domain.admin.parking.model.ParkingOperationValues;
import jumin.domain.admin.parking.model.ParkingScheduleValues;
import jumin.domain.admin.parking.support.ParkingText;
import jumin.domain.parking.entity.ParkingDataSource;
import jumin.domain.parking.entity.ParkingOperationStatus;
import jumin.global.response.ValidationErrorField;

final class ParkingCsvRowReader {

    private static final Pattern DECIMAL = Pattern.compile("[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?");
    // PostgreSQL timestamp.h의 MIN_TIMESTAMP 이상, END_TIMESTAMP 미만 범위다.
    private static final Instant MIN_DB_TIMESTAMP = Instant.parse("-4713-11-24T00:00:00Z");
    private static final Instant MAX_DB_TIMESTAMP_EXCLUSIVE = Instant.parse("+294277-01-01T00:00:00Z");
    private final ParkingCsvRecordReader record;
    private final Map<ParkingCsvColumn, Integer> indexes;
    private final List<ValidationErrorField> errors;
    private final ConversionCache conversionCache;
    private final ParkingScheduleValues[] previousSchedules = new ParkingScheduleValues[3];
    private final LocalTime[][] timesByMinute = new LocalTime[24 * 60][];
    private ParkingOperationValues previousOperation;
    private int previousYear = -1;
    private int previousMonth;
    private int previousDay;
    private long previousEpochDay;

    ParkingCsvRowReader(ParkingCsvRecordReader record, Map<ParkingCsvColumn, Integer> indexes,
            List<ValidationErrorField> errors, ConversionCache conversionCache) {
        this.record = record;
        this.indexes = indexes;
        this.errors = errors;
        this.conversionCache = conversionCache;
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
        boolean mechanical = parseYesNo(MECHANICAL);
        Boolean isPublic = bool(IS_PUBLIC, false);
        Boolean active = bool(ACTIVE, true);
        Instant lotCheckedAt = instant(LOT_SOURCE_CHECKED_AT);
        ParkingOperationValues operation = operation();

        if (errors.size() != errorCount) {
            return null;
        }
        ParkingLotValues lot = new ParkingLotValues(source, externalId, name, sido, sigungu,
                address, latitude, longitude, capacity, mechanical, isPublic, active, lotCheckedAt);
        return new ParkingCsvRow(record.getRecordNumber(), lot, operation);
    }

    private ParkingOperationValues operation() {
        Integer baseFreeMinutes = nonNegativeInteger(BASE_FREE_MINUTES);
        Integer baseMinutes = nonNegativeInteger(BASE_MINUTES);
        Integer baseFee = nonNegativeInteger(BASE_FEE);
        Integer additionalMinutes = nonNegativeInteger(ADDITIONAL_MINUTES);
        Integer additionalFee = nonNegativeInteger(ADDITIONAL_FEE);
        Integer dailyMaxFee = nonNegativeInteger(DAILY_MAX_FEE);
        Integer monthlyFee = nonNegativeInteger(MONTHLY_FEE);
        Boolean weekdayPaid = bool(WEEKDAY_PAID, false);
        Boolean saturdayPaid = bool(SATURDAY_PAID, false);
        Boolean holidayPaid = bool(HOLIDAY_PAID, false);
        ParkingScheduleValues weekday = schedule(0, WEEKDAY_STATUS, WEEKDAY_OPEN_TIME, WEEKDAY_CLOSE_TIME);
        ParkingScheduleValues weekend = schedule(1, WEEKEND_STATUS, WEEKEND_OPEN_TIME, WEEKEND_CLOSE_TIME);
        ParkingScheduleValues holiday = schedule(2, HOLIDAY_STATUS, HOLIDAY_OPEN_TIME, HOLIDAY_CLOSE_TIME);
        Instant sourceCheckedAt = instant(OPERATION_SOURCE_CHECKED_AT);
        ParkingOperationValues previous = previousOperation;
        if (previous != null
                && Objects.equals(previous.baseFreeMinutes(), baseFreeMinutes)
                && Objects.equals(previous.baseMinutes(), baseMinutes)
                && Objects.equals(previous.baseFee(), baseFee)
                && Objects.equals(previous.additionalMinutes(), additionalMinutes)
                && Objects.equals(previous.additionalFee(), additionalFee)
                && Objects.equals(previous.dailyMaxFee(), dailyMaxFee)
                && Objects.equals(previous.monthlyFee(), monthlyFee)
                && Objects.equals(previous.weekdayPaid(), weekdayPaid)
                && Objects.equals(previous.saturdayPaid(), saturdayPaid)
                && Objects.equals(previous.holidayPaid(), holidayPaid)
                && Objects.equals(previous.weekday(), weekday)
                && Objects.equals(previous.weekend(), weekend)
                && Objects.equals(previous.holiday(), holiday)
                && Objects.equals(previous.sourceCheckedAt(), sourceCheckedAt)) {
            return previous;
        }
        previousOperation = new ParkingOperationValues(baseFreeMinutes, baseMinutes, baseFee, additionalMinutes,
                additionalFee, dailyMaxFee, monthlyFee, weekdayPaid, saturdayPaid, holidayPaid,
                weekday, weekend, holiday, sourceCheckedAt);
        return previousOperation;
    }

    private ParkingScheduleValues schedule(int cacheIndex, ParkingCsvColumn statusColumn,
            ParkingCsvColumn openColumn, ParkingCsvColumn closeColumn) {
        ParkingOperationStatus status = enumValue(statusColumn, ParkingOperationStatus.class, false);
        LocalTime openTime = time(openColumn);
        LocalTime closeTime = time(closeColumn);
        ParkingScheduleValues previous = previousSchedules[cacheIndex];
        if (previous != null && previous.status() == status
                && Objects.equals(previous.openTime(), openTime) && Objects.equals(previous.closeTime(), closeTime)) {
            return previous;
        }
        ParkingScheduleValues schedule = new ParkingScheduleValues(status, openTime, closeTime);
        previousSchedules[cacheIndex] = schedule;
        return schedule;
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

    private boolean parseYesNo(ParkingCsvColumn column) {
        String value = value(column, false);
        if (value == null) {
            return false;
        }
        if (value.equals("Y")) {
            return true;
        }
        if (value.equals("N")) {
            return false;
        }
        error(column, "Y 또는 N이어야 합니다.");
        return false;
    }

    private Integer nonNegativeInteger(ParkingCsvColumn column) {
        CharSequence value = tokenValue(column, false);
        if (value == null) {
            return null;
        }
        Integer cached = conversionCache.integer(column, value);
        if (cached != null) {
            return cached;
        }
        try {
            if (containsOnlyAsciiDigits(value)) {
                Integer result = Integer.parseInt(value, 0, value.length(), 10);
                conversionCache.rememberInteger(column, value, result);
                return result;
            }
        } catch (NumberFormatException exception) {
            // 정수 범위를 넘는 값도 해당 열의 검증 오류로 수집한다.
        }
        error(column, "0 이상 2147483647 이하의 정수여야 합니다.");
        return null;
    }

    private boolean containsOnlyAsciiDigits(CharSequence value) {
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (character < '0' || character > '9') {
                return false;
            }
        }
        return true;
    }

    private Double coordinate(ParkingCsvColumn column, int min, int max) {
        String value = value(column, false);
        if (value == null) {
            return null;
        }
        Double cached = conversionCache.coordinate(column, value);
        if (cached != null) {
            return cached;
        }
        try {
            if (conversionCache.matchesDecimal(value)) {
                double number = Double.parseDouble(value);
                if (Double.isFinite(number) && number >= min && number <= max) {
                    if (number == 0.0) {
                        number = 0.0;
                    }
                    Double result = number;
                    conversionCache.rememberCoordinate(column, value, result);
                    return result;
                }
            }
        } catch (NumberFormatException exception) {
            // 숫자로 변환할 수 없는 값도 다른 열과 함께 반환한다.
        }
        error(column, min + " 이상 " + max + " 이하의 유한한 숫자여야 합니다.");
        return null;
    }

    private LocalTime time(ParkingCsvColumn column) {
        CharSequence value = tokenValue(column, false);
        if (value == null) {
            return null;
        }
        LocalTime cached = conversionCache.time(column, value);
        if (cached != null) {
            return cached;
        }
        try {
            LocalTime result = parseTime(value);
            if (result != null) {
                conversionCache.rememberTime(column, value, result);
                return result;
            }
        } catch (DateTimeException exception) {
            // 상태와 시간의 조합은 검사하지 않고 입력된 시간만 검사한다.
        }
        error(column, "HH:mm 또는 HH:mm:ss 형식의 유효한 시간이어야 합니다.");
        return null;
    }

    private Instant instant(ParkingCsvColumn column) {
        CharSequence value = tokenValue(column, true);
        if (value == null) {
            return null;
        }
        Instant cached = conversionCache.instant(column, value);
        if (cached != null) {
            return cached;
        }
        try {
            Instant result = parseCommonInstant(value);
            if (result == null) {
                result = OffsetDateTime.parse(value).toInstant();
            }
            if (result.isBefore(MIN_DB_TIMESTAMP) || !result.isBefore(MAX_DB_TIMESTAMP_EXCLUSIVE)) {
                error(column, "PostgreSQL에 저장할 수 있는 시각 범위를 벗어났습니다.");
                return null;
            }
            if (result.getNano() % 1_000 != 0) {
                error(column, "DB에 정확히 저장할 수 있도록 소수 초는 마이크로초(6자리) 정밀도여야 합니다.");
                return null;
            }
            conversionCache.rememberInstant(column, value, result);
            return result;
        } catch (DateTimeException exception) {
            error(column, "시간대 오프셋을 포함한 ISO 8601 시각이어야 합니다.");
            return null;
        }
    }

    private LocalTime parseTime(CharSequence value) {
        if (value.length() != 5 && value.length() != 8) {
            return null;
        }
        if (value.charAt(2) != ':') {
            return null;
        }
        int hour = asciiDigits(value, 0, 2);
        int minute = asciiDigits(value, 3, 5);
        int second = 0;
        if (value.length() == 8) {
            if (value.charAt(5) != ':') {
                return null;
            }
            second = asciiDigits(value, 6, 8);
        }
        if (hour < 0 || minute < 0 || second < 0) {
            return null;
        }
        if (hour > 23 || minute > 59 || second > 59) {
            throw new DateTimeException("Invalid time");
        }
        int minuteOfDay = hour * 60 + minute;
        LocalTime[] seconds = timesByMinute[minuteOfDay];
        if (seconds == null) {
            seconds = new LocalTime[60];
            timesByMinute[minuteOfDay] = seconds;
        }
        LocalTime result = seconds[second];
        if (result == null) {
            result = LocalTime.of(hour, minute, second);
            seconds[second] = result;
        }
        return result;
    }

    private Instant parseCommonInstant(CharSequence value) {
        // 흔한 네 자리 연도와 분 단위 오프셋만 직접 읽고 나머지 ISO 형식은 기존 파서에 맡긴다.
        if (value.length() < 17 || value.charAt(4) != '-' || value.charAt(7) != '-'
                || value.charAt(10) != 'T' || value.charAt(13) != ':') {
            return null;
        }
        int offsetIndex = 16;
        int second = 0;
        if (value.charAt(offsetIndex) == ':') {
            if (value.length() < 20) {
                return null;
            }
            second = asciiDigits(value, 17, 19);
            offsetIndex = 19;
        }
        int nano = 0;
        if (offsetIndex == 19 && value.charAt(offsetIndex) == '.') {
            int fractionStart = ++offsetIndex;
            while (offsetIndex < value.length() && isAsciiDigit(value.charAt(offsetIndex))) {
                offsetIndex++;
            }
            int fractionLength = offsetIndex - fractionStart;
            if (fractionLength < 1 || fractionLength > 9) {
                return null;
            }
            nano = asciiDigits(value, fractionStart, offsetIndex);
            for (int precision = fractionLength; precision < 9; precision++) {
                nano *= 10;
            }
        }
        int offsetSeconds = parseOffsetSeconds(value, offsetIndex);
        if (offsetSeconds == Integer.MIN_VALUE) {
            return null;
        }
        int year = asciiDigits(value, 0, 4);
        int month = asciiDigits(value, 5, 7);
        int day = asciiDigits(value, 8, 10);
        int hour = asciiDigits(value, 11, 13);
        int minute = asciiDigits(value, 14, 16);
        if (year < 0 || month < 0 || day < 0 || hour < 0 || minute < 0 || second < 0) {
            return null;
        }
        if (hour > 23 || minute > 59 || second > 59) {
            throw new DateTimeException("Invalid time");
        }
        long epochSecond = epochDay(year, month, day) * 86_400L
                + hour * 3_600L + minute * 60L + second - offsetSeconds;
        return Instant.ofEpochSecond(epochSecond, nano);
    }

    private int parseOffsetSeconds(CharSequence value, int offsetIndex) {
        if (value.length() == offsetIndex + 1 && value.charAt(offsetIndex) == 'Z') {
            return 0;
        }
        if (value.length() != offsetIndex + 6 || value.charAt(offsetIndex + 3) != ':') {
            return Integer.MIN_VALUE;
        }
        char sign = value.charAt(offsetIndex);
        if (sign != '+' && sign != '-') {
            return Integer.MIN_VALUE;
        }
        int hour = asciiDigits(value, offsetIndex + 1, offsetIndex + 3);
        int minute = asciiDigits(value, offsetIndex + 4, offsetIndex + 6);
        if (hour < 0 || minute < 0) {
            return Integer.MIN_VALUE;
        }
        if (hour > 18 || minute > 59 || hour == 18 && minute != 0) {
            throw new DateTimeException("Invalid offset");
        }
        int seconds = hour * 3_600 + minute * 60;
        if (sign == '-') {
            return -seconds;
        }
        return seconds;
    }

    private long epochDay(int year, int month, int day) {
        if (year == previousYear && month == previousMonth && day == previousDay) {
            return previousEpochDay;
        }
        long epochDay = LocalDate.of(year, month, day).toEpochDay();
        previousYear = year;
        previousMonth = month;
        previousDay = day;
        previousEpochDay = epochDay;
        return epochDay;
    }

    private int asciiDigits(CharSequence value, int start, int end) {
        int number = 0;
        for (int index = start; index < end; index++) {
            char character = value.charAt(index);
            if (!isAsciiDigit(character)) {
                return -1;
            }
            number = number * 10 + character - '0';
        }
        return number;
    }

    private boolean isAsciiDigit(char character) {
        return character >= '0' && character <= '9';
    }

    private CharSequence tokenValue(ParkingCsvColumn column, boolean required) {
        ParkingCsvToken value = record.token(indexes.get(column)).trimSpaces();
        if (value.isEmpty()) {
            if (required) {
                error(column, "필수 값입니다.");
            }
            return null;
        }
        for (int index = 0; index < value.length(); index++) {
            if (value.charAt(index) == '\0') {
                error(column, "NUL 문자는 허용하지 않습니다.");
                return null;
            }
        }
        return value;
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

    static final class ConversionCache {

        private static final int MAX_INPUT_LENGTH = 64;
        private static final int COLUMN_COUNT = ParkingCsvColumn.values().length;

        private final char[][] inputs = new char[COLUMN_COUNT][];
        private final int[] lengths = new int[COLUMN_COUNT];
        private final LocalTime[] times = new LocalTime[COLUMN_COUNT];
        private final Instant[] instants = new Instant[COLUMN_COUNT];
        private final Integer[] integers = new Integer[COLUMN_COUNT];
        private final Double[] coordinates = new Double[COLUMN_COUNT];
        private final Matcher decimalMatcher = DECIMAL.matcher("");

        Integer integer(ParkingCsvColumn column, CharSequence input) {
            if (matches(column, input)) {
                return integers[column.ordinal()];
            }
            return null;
        }

        void rememberInteger(ParkingCsvColumn column, CharSequence input, Integer value) {
            if (remember(column, input)) {
                integers[column.ordinal()] = value;
            }
        }

        Double coordinate(ParkingCsvColumn column, CharSequence input) {
            if (matches(column, input)) {
                return coordinates[column.ordinal()];
            }
            return null;
        }

        void rememberCoordinate(ParkingCsvColumn column, CharSequence input, Double value) {
            if (remember(column, input)) {
                coordinates[column.ordinal()] = value;
            }
        }

        boolean matchesDecimal(String input) {
            try {
                return decimalMatcher.reset(input).matches();
            } finally {
                decimalMatcher.reset("");
            }
        }

        LocalTime time(ParkingCsvColumn column, CharSequence input) {
            if (matches(column, input)) {
                return times[column.ordinal()];
            }
            return null;
        }

        void rememberTime(ParkingCsvColumn column, CharSequence input, LocalTime value) {
            if (remember(column, input)) {
                times[column.ordinal()] = value;
            }
        }

        Instant instant(ParkingCsvColumn column, CharSequence input) {
            if (matches(column, input)) {
                return instants[column.ordinal()];
            }
            return null;
        }

        void rememberInstant(ParkingCsvColumn column, CharSequence input, Instant value) {
            if (remember(column, input)) {
                instants[column.ordinal()] = value;
            }
        }

        private boolean matches(ParkingCsvColumn column, CharSequence input) {
            int index = column.ordinal();
            char[] previous = inputs[index];
            if (previous == null || lengths[index] != input.length()) {
                return false;
            }
            for (int character = 0; character < input.length(); character++) {
                if (previous[character] != input.charAt(character)) {
                    return false;
                }
            }
            return true;
        }

        private boolean remember(ParkingCsvColumn column, CharSequence input) {
            if (input.length() > MAX_INPUT_LENGTH) {
                return false;
            }
            int index = column.ordinal();
            if (inputs[index] == null) {
                inputs[index] = new char[MAX_INPUT_LENGTH];
            }
            for (int character = 0; character < input.length(); character++) {
                inputs[index][character] = input.charAt(character);
            }
            lengths[index] = input.length();
            return true;
        }
    }
}
