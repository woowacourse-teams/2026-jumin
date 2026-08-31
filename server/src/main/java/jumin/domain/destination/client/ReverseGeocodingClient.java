package jumin.domain.destination.client;

import java.io.IOException;
import jumin.config.ReverseGeocodingProperties;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Component
public class ReverseGeocodingClient {

    private static final String CLIENT_ID_HEADER = "X-NCP-APIGW-API-KEY-ID";
    private static final String CLIENT_SECRET_HEADER = "X-NCP-APIGW-API-KEY";
    private static final String ROAD_ADDRESS_RESULT = "roadaddr";
    private static final int UNKNOWN_STATUS_CODE = -1;
    private static final int SUCCESS_STATUS_CODE = 0;
    private static final int NO_RESULTS_STATUS_CODE = 3;

    private final ReverseGeocodingProperties properties;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public ReverseGeocodingClient(
            @Qualifier("reverseGeocodingRestClient") RestClient restClient,
            ObjectMapper objectMapper,
            ReverseGeocodingProperties properties
    ) {
        this.restClient = restClient;
        this.objectMapper = objectMapper;
        this.properties = properties;
    }

    public ReverseGeocodingResult reverseGeocode(double latitude, double longitude) {
        validateCredentials();

        long startedAt = System.nanoTime();

        try {
            String responseBody = fetchResponse(latitude, longitude, startedAt);
            return parseResponse(responseBody, elapsedMillis(startedAt));
        } catch (RestClientException exception) {
            logRequestFailure(exception, startedAt);
            throw new BusinessException(ErrorCode.DESTINATION_REVERSE_GEOCODING_CLIENT_FAILED);
        }
    }

    private void validateCredentials() {
        if (StringUtils.hasText(properties.clientId()) && StringUtils.hasText(properties.clientSecret())) {
            return;
        }
        log.atError()
                .setMessage("역지오코딩 API 자격 증명이 설정되지 않았습니다.")
                .addKeyValue("failureType", "missing_credentials")
                .log();
        throw new BusinessException(ErrorCode.DESTINATION_REVERSE_GEOCODING_CLIENT_FAILED);
    }

    private void logRequestFailure(RestClientException exception, long startedAt) {
        log.atWarn()
                .setMessage("역지오코딩 API 호출에 실패했습니다.")
                .addKeyValue("failureType", "request_failure")
                .addKeyValue("cause", exception.getClass().getSimpleName())
                .addKeyValue("durationMs", elapsedMillis(startedAt))
                .log();
    }

    private String fetchResponse(double latitude, double longitude, long startedAt) {
        return restClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/map-reversegeocode/v2/gc")
                        .queryParam("coords", longitude + "," + latitude)
                        .queryParam("sourcecrs", "EPSG:4326")
                        .queryParam("orders", ROAD_ADDRESS_RESULT)
                        .queryParam("output", "json")
                        .build())
                .header(CLIENT_ID_HEADER, properties.clientId())
                .header(CLIENT_SECRET_HEADER, properties.clientSecret())
                .accept(MediaType.APPLICATION_JSON)
                .retrieve()
                .onStatus(
                        status -> status.value() == 429,
                        (request, clientResponse) -> handleRateLimit(clientResponse, startedAt)
                )
                .onStatus(
                        HttpStatusCode::isError,
                        (request, clientResponse) -> handleUpstreamError(clientResponse, startedAt)
                )
                .body(String.class);
    }

    private void handleRateLimit(ClientHttpResponse clientResponse, long startedAt) throws IOException {
        log.atWarn()
                .setMessage("역지오코딩 API 요청이 제한되었습니다.")
                .addKeyValue("status", clientResponse.getStatusCode().value())
                .addKeyValue("failureType", "rate_limit")
                .addKeyValue("durationMs", elapsedMillis(startedAt))
                .log();
        throw new BusinessException(ErrorCode.DESTINATION_REVERSE_GEOCODING_RATE_LIMITED);
    }

    private void handleUpstreamError(ClientHttpResponse clientResponse, long startedAt) throws IOException {
        log.atWarn()
                .setMessage("역지오코딩 API가 오류 응답을 반환했습니다.")
                .addKeyValue("status", clientResponse.getStatusCode().value())
                .addKeyValue("failureType", "upstream_error")
                .addKeyValue("durationMs", elapsedMillis(startedAt))
                .log();
        throw new BusinessException(ErrorCode.DESTINATION_REVERSE_GEOCODING_CLIENT_FAILED);
    }

    private ReverseGeocodingResult parseResponse(String responseBody, long durationMs) {
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
        String buildingNumber = mainNumber;
        if (StringUtils.hasText(subNumber)) {
            buildingNumber = mainNumber + "-" + subNumber;
        }

        StringBuilder address = new StringBuilder();
        appendAddressPart(address, textOrEmpty(result.path("region").path("area1").path("name")));
        appendAddressPart(address, textOrEmpty(result.path("region").path("area2").path("name")));
        appendEupMyeon(address, textOrEmpty(result.path("region").path("area3").path("name")));
        appendAddressPart(address, roadName);
        appendAddressPart(address, buildingNumber);
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

    private long elapsedMillis(long startedAt) {
        return (System.nanoTime() - startedAt) / 1_000_000;
    }
}
