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
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Component
public class ReverseGeocodingClient {

    private static final String CLIENT_ID_HEADER = "X-NCP-APIGW-API-KEY-ID";
    private static final String CLIENT_SECRET_HEADER = "X-NCP-APIGW-API-KEY";
    private static final String ROAD_ADDRESS_ORDER = "roadaddr";

    private final ReverseGeocodingProperties properties;
    private final ReverseGeocodingResponseParser responseParser;
    private final RestClient restClient;

    public ReverseGeocodingClient(
            @Qualifier("reverseGeocodingRestClient") RestClient restClient,
            ObjectMapper objectMapper,
            ReverseGeocodingProperties properties
    ) {
        this.restClient = restClient;
        this.responseParser = new ReverseGeocodingResponseParser(objectMapper);
        this.properties = properties;
    }

    public ReverseGeocodingResult reverseGeocode(double latitude, double longitude) {
        validateCredentials();

        long startedAt = System.nanoTime();

        try {
            String responseBody = fetchResponse(latitude, longitude, startedAt);
            return responseParser.parse(responseBody, elapsedMillis(startedAt));
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
                        .queryParam("orders", ROAD_ADDRESS_ORDER)
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

    private long elapsedMillis(long startedAt) {
        return (System.nanoTime() - startedAt) / 1_000_000;
    }
}
