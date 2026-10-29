package jumin.domain.parkingavailability.client;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.time.temporal.ChronoField;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import jumin.domain.parkingavailability.entity.AvailabilityProvider;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

final class AvailabilityPayloadSupport {

    static final int PAGE_SIZE = 1000;
    static final int MAX_PAGES = 200;

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final List<DateTimeFormatter> TIMESTAMP_FORMATS = List.of(
            timestampFormat("uuuu-MM-dd HH:mm:ss"),
            timestampFormat("uuuu-MM-dd'T'HH:mm:ss"),
            timestampFormat("uuuuMMddHHmmss")
    );

    private AvailabilityPayloadSupport() {
    }

    static JsonNode parse(ObjectMapper mapper, String body, AvailabilityProvider provider) {
        if (body == null || body.isBlank()) {
            throw failure(provider, "API 응답이 비어 있습니다.");
        }
        try {
            JsonNode root = mapper.readTree(body);
            if (root == null || !root.isObject()) {
                throw failure(provider, "API 응답 구조가 올바르지 않습니다.");
            }
            return root;
        } catch (JacksonException exception) {
            throw failure(provider, "API 응답을 JSON으로 해석할 수 없습니다.");
        }
    }

    static String text(JsonNode value) {
        return value.isString() || value.isNumber() ? value.asString().trim() : "";
    }

    static Integer integer(JsonNode value) {
        String raw = text(value);
        if (raw.isBlank()) {
            return null;
        }
        try {
            return new BigDecimal(raw).intValueExact();
        } catch (NumberFormatException | ArithmeticException exception) {
            return null;
        }
    }

    static Instant timestamp(JsonNode value) {
        String raw = text(value);
        for (DateTimeFormatter format : TIMESTAMP_FORMATS) {
            try {
                return LocalDateTime.parse(raw, format).atZone(KST).toInstant();
            } catch (DateTimeParseException ignored) {
            }
        }
        return null;
    }

    static List<JsonNode> rows(JsonNode items, AvailabilityProvider provider, boolean allowSingleObject) {
        if (hasNoRows(items)) {
            return List.of();
        }
        if (allowSingleObject && items.isObject()) {
            return List.of(items);
        }
        if (!items.isArray()) {
            throw failure(provider, "주차장 목록 형식이 올바르지 않습니다.");
        }
        List<JsonNode> result = new ArrayList<>();
        for (JsonNode row : items) {
            if (!row.isObject()) {
                throw failure(provider, "주차장 항목 형식이 올바르지 않습니다.");
            }
            result.add(row);
        }
        return result;
    }

    private static boolean hasNoRows(JsonNode items) {
        return items.isMissingNode() || items.isNull() || (items.isString() && items.asString().isBlank());
    }

    static IllegalStateException failure(AvailabilityProvider provider, String reason) {
        return new IllegalStateException(provider.getDisplayName() + " 실시간 여석 수집에 실패했습니다. " + reason);
    }

    private static DateTimeFormatter timestampFormat(String pattern) {
        return new DateTimeFormatterBuilder()
                .appendPattern(pattern)
                .optionalStart()
                .appendFraction(ChronoField.NANO_OF_SECOND, 0, 9, true)
                .optionalEnd()
                .toFormatter(Locale.ROOT)
                .withResolverStyle(ResolverStyle.STRICT);
    }
}
