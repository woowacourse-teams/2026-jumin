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
    private static final String LOT_ADDRESS_RESULT = "addr";
    private static final String ADMINISTRATIVE_ADDRESS_RESULT = "admcode";
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
            validateResponseRoot(root, durationMs);
            return parseResult(root, durationMs);
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

    private void validateResponseRoot(JsonNode root, long durationMs) {
        if (root != null && root.isObject()) {
            return;
        }

        String responseType = "null";
        if (root != null) {
            responseType = root.getNodeType().name();
        }
        log.atWarn()
                .setMessage("역지오코딩 API 응답 형식이 올바르지 않습니다.")
                .addKeyValue("failureType", "invalid_response")
                .addKeyValue("responseType", responseType)
                .addKeyValue("durationMs", durationMs)
                .log();
        throw new BusinessException(ErrorCode.DESTINATION_REVERSE_GEOCODING_CLIENT_FAILED);
    }

    private ReverseGeocodingResult parseResult(JsonNode root, long durationMs) {
        JsonNode status = root.path("status");
        int statusCode = status.path("code").asInt(UNKNOWN_STATUS_CODE);
        if (statusCode == NO_RESULTS_STATUS_CODE) {
            return ReverseGeocodingResult.empty();
        }
        if (statusCode != SUCCESS_STATUS_CODE) {
            log.atWarn()
                    .setMessage("역지오코딩 API가 실패 상태를 반환했습니다.")
                    .addKeyValue("failureType", "provider_error")
                    .addKeyValue("statusCode", statusCode)
                    .addKeyValue("statusName", textOrEmpty(status.path("name")))
                    .addKeyValue("statusMessage", textOrEmpty(status.path("message")))
                    .addKeyValue("durationMs", durationMs)
                    .log();
            throw new BusinessException(ErrorCode.DESTINATION_REVERSE_GEOCODING_CLIENT_FAILED);
        }

        JsonNode results = root.path("results");
        JsonNode roadAddressResult = findResult(results, ROAD_ADDRESS_RESULT);
        JsonNode lotAddressResult = findResult(results, LOT_ADDRESS_RESULT);
        JsonNode administrativeAddressResult = findResult(results, ADMINISTRATIVE_ADDRESS_RESULT);
        return mapResults(roadAddressResult, lotAddressResult, administrativeAddressResult);
    }

    private JsonNode findResult(JsonNode results, String resultName) {
        if (!results.isArray()) {
            return null;
        }

        for (JsonNode result : results) {
            if (resultName.equals(result.path("name").asString(""))) {
                return result;
            }
        }
        return null;
    }

    private ReverseGeocodingResult mapResults(
            JsonNode roadAddressResult,
            JsonNode lotAddressResult,
            JsonNode administrativeAddressResult
    ) {
        String buildingName = "";
        String roadAddress = "";
        if (roadAddressResult != null) {
            JsonNode land = roadAddressResult.path("land");
            buildingName = readBuildingName(land.path("addition0"));
            roadAddress = buildRoadAddress(roadAddressResult, land);
        }

        String lotAddress = buildLotAddress(lotAddressResult);
        String administrativeAddress = buildAdministrativeAddress(administrativeAddressResult);
        return new ReverseGeocodingResult(buildingName, roadAddress, lotAddress, administrativeAddress);
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

    private String buildLotAddress(JsonNode result) {
        if (result == null) {
            return "";
        }

        JsonNode land = result.path("land");
        String mainNumber = textOrEmpty(land.path("number1"));
        if (!StringUtils.hasText(mainNumber)) {
            return "";
        }

        String subNumber = textOrEmpty(land.path("number2"));
        StringBuilder landNumber = new StringBuilder();
        if ("2".equals(textOrEmpty(land.path("type")))) {
            landNumber.append("산 ");
        }
        landNumber.append(mainNumber);
        if (StringUtils.hasText(subNumber)) {
            landNumber.append('-').append(subNumber);
        }

        StringBuilder address = new StringBuilder();
        JsonNode region = result.path("region");
        appendAddressPart(address, textOrEmpty(region.path("area1").path("name")));
        appendAddressPart(address, textOrEmpty(region.path("area2").path("name")));
        appendAddressPart(address, textOrEmpty(region.path("area3").path("name")));
        appendAddressPart(address, textOrEmpty(region.path("area4").path("name")));
        appendAddressPart(address, landNumber.toString());
        return address.toString();
    }

    private String buildAdministrativeAddress(JsonNode result) {
        if (result == null) {
            return "";
        }

        JsonNode region = result.path("region");
        StringBuilder address = new StringBuilder();
        appendAddressPart(address, textOrEmpty(region.path("area1").path("name")));
        appendAddressPart(address, textOrEmpty(region.path("area2").path("name")));
        appendAddressPart(address, textOrEmpty(region.path("area3").path("name")));
        appendAddressPart(address, textOrEmpty(region.path("area4").path("name")));
        return address.toString();
    }

    private String textOrEmpty(JsonNode node) {
        if (node.isMissingNode() || node.isNull()) {
            return "";
        }
        return node.asString("");
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

        private void appendEupMyeon(StringBuilder address, String areaName) {
        if (areaName == null) {
            return;
        }
        String normalizedAreaName = areaName.trim();
        if (normalizedAreaName.endsWith("읍") || normalizedAreaName.endsWith("면")) {
            appendAddressPart(address, normalizedAreaName);
        }
    }
}
