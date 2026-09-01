package jumin.domain.destination.client;

import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.util.StringUtils;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Slf4j
final class ReverseGeocodingResponseParser {

    private static final String ROAD_ADDRESS_RESULT = "roadaddr";
    private static final int UNKNOWN_STATUS_CODE = -1;
    private static final int SUCCESS_STATUS_CODE = 0;
    private static final int NO_RESULTS_STATUS_CODE = 3;

    private final ObjectMapper objectMapper;

    ReverseGeocodingResponseParser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    ReverseGeocodingResult parse(String responseBody, long durationMs) {
        validateResponseBody(responseBody, durationMs);

        try {
            JsonNode root = objectMapper.readTree(responseBody);
            if (root == null || !root.isObject()) {
                throw new BusinessException(ErrorCode.DESTINATION_REVERSE_GEOCODING_CLIENT_FAILED);
            }
            return parseResult(root);
        } catch (JacksonException exception) {
            log.atWarn()
                    .setMessage("역지오코딩 API 응답을 해석하지 못했습니다.")
                    .addKeyValue("failureType", "parse_error")
                    .addKeyValue("cause", exception.getClass().getSimpleName())
                    .addKeyValue("durationMs", durationMs)
                    .log();
            throw new BusinessException(ErrorCode.DESTINATION_REVERSE_GEOCODING_CLIENT_FAILED);
        }
    }

    private void validateResponseBody(String responseBody, long durationMs) {
        if (StringUtils.hasText(responseBody)) {
            return;
        }
        log.atWarn()
                .setMessage("역지오코딩 API 응답이 비어 있습니다.")
                .addKeyValue("failureType", "empty_response")
                .addKeyValue("durationMs", durationMs)
                .log();
        throw new BusinessException(ErrorCode.DESTINATION_REVERSE_GEOCODING_CLIENT_FAILED);
    }

    private ReverseGeocodingResult parseResult(JsonNode root) {
        int statusCode = root.path("status").path("code").asInt(UNKNOWN_STATUS_CODE);
        if (statusCode == NO_RESULTS_STATUS_CODE) {
            return ReverseGeocodingResult.empty();
        }
        if (statusCode != SUCCESS_STATUS_CODE) {
            throw new BusinessException(ErrorCode.DESTINATION_REVERSE_GEOCODING_CLIENT_FAILED);
        }

        JsonNode roadAddressResult = findRoadAddressResult(root.path("results"));
        if (roadAddressResult == null) {
            return ReverseGeocodingResult.empty();
        }
        return mapResult(roadAddressResult);
    }

    private ReverseGeocodingResult mapResult(JsonNode roadAddressResult) {
        JsonNode land = roadAddressResult.path("land");
        String buildingName = readBuildingName(land.path("addition0"));
        String roadAddress = buildRoadAddress(roadAddressResult, land);
        return new ReverseGeocodingResult(buildingName, roadAddress);
    }

    private JsonNode findRoadAddressResult(JsonNode results) {
        if (!results.isArray()) {
            return null;
        }

        for (JsonNode result : results) {
            if (ROAD_ADDRESS_RESULT.equals(result.path("name").asString(""))) {
                return result;
            }
        }
        return null;
    }

    private String readBuildingName(JsonNode addition) {
        if (!"building".equals(addition.path("type").asString(""))) {
            return "";
        }
        return textOrEmpty(addition.path("value"));
    }

    private String buildRoadAddress(JsonNode result, JsonNode land) {
        String roadName = textOrEmpty(land.path("name"));
        String mainNumber = textOrEmpty(land.path("number1"));
        if (!StringUtils.hasText(roadName) || !StringUtils.hasText(mainNumber)) {
            return "";
        }

        String subNumber = textOrEmpty(land.path("number2"));
        StringBuilder buildingNumber = new StringBuilder(mainNumber);
        if (StringUtils.hasText(subNumber)) {
            buildingNumber.append('-').append(subNumber);
        }

        StringBuilder address = new StringBuilder();
        appendAddressPart(address, textOrEmpty(result.path("region").path("area1").path("name")));
        appendAddressPart(address, textOrEmpty(result.path("region").path("area2").path("name")));
        appendEupMyeon(address, textOrEmpty(result.path("region").path("area3").path("name")));
        appendAddressPart(address, roadName);
        appendAddressPart(address, buildingNumber.toString());
        return address.toString();
    }

    private String textOrEmpty(JsonNode node) {
        if (node.isMissingNode() || node.isNull()) {
            return "";
        }
        return node.asString("");
    }

    private void appendEupMyeon(StringBuilder address, String areaName) {
        if (areaName == null) {
            return;
        }
        String normalizedAreaName = areaName.trim();
        if (normalizedAreaName.endsWith("읍") || normalizedAreaName.endsWith("면")) {
            appendAddressPart(address, normalizedAreaName);
        }
    }

    private void appendAddressPart(StringBuilder address, String part) {
        if (!StringUtils.hasText(part)) {
            return;
        }
        if (!address.isEmpty()) {
            address.append(' ');
        }
        address.append(part.trim());
    }
}
