package jumin.domain.destination.client;

import jumin.config.LocalSearchProperties;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Component
@RequiredArgsConstructor
public class LocalSearchClient {

    private static final String CLIENT_ID_HEADER = "X-NCP-APIGW-API-KEY-ID";
    private static final String CLIENT_SECRET_HEADER = "X-NCP-APIGW-API-KEY";
    private static final int MAX_DISPLAY_COUNT = 5;

    private final RestClient restClient;
    private final LocalSearchProperties properties;
    private final ObjectMapper objectMapper;

    public LocalSearchResponse search(String query) {
        if (!StringUtils.hasText(properties.clientId()) || !StringUtils.hasText(properties.clientSecret())) {
            log.atError()
                    .setMessage("지역 검색 API 자격 증명이 설정되지 않았습니다.")
                    .addKeyValue("failureType", "missing_credentials")
                    .log();
            throw new BusinessException(ErrorCode.NAVER_DESTINATION_SEARCH_FAILED);
        }

        long startedAt = System.nanoTime();

        try {
            String responseBody = fetchResponse(query, startedAt);
            return parseResponse(responseBody, elapsedMillis(startedAt));
        } catch (RestClientException exception) {
            log.atWarn()
                    .setMessage("지역 검색 API 호출에 실패했습니다.")
                    .addKeyValue("failureType", "request_failure")
                    .addKeyValue("cause", exception.getClass().getSimpleName())
                    .addKeyValue("durationMs", elapsedMillis(startedAt))
                    .log();
            throw new BusinessException(ErrorCode.NAVER_DESTINATION_SEARCH_FAILED);
        }
    }

    private String fetchResponse(String query, long startedAt) {
        return restClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/search/v1/local")
                            .queryParam("query", query)
                            .queryParam("display", MAX_DISPLAY_COUNT)
                            .build())
                    .header(CLIENT_ID_HEADER, properties.clientId())
                    .header(CLIENT_SECRET_HEADER, properties.clientSecret())
                    .retrieve()
                    .onStatus(
                            status -> status.value() == 429,
                            (request, clientResponse) -> {
                                log.atWarn()
                                        .setMessage("지역 검색 API 요청이 제한되었습니다.")
                                        .addKeyValue("status", clientResponse.getStatusCode().value())
                                        .addKeyValue("failureType", "rate_limit")
                                        .addKeyValue("durationMs", elapsedMillis(startedAt))
                                        .log();
                                throw new BusinessException(ErrorCode.DESTINATION_SEARCH_RATE_LIMITED);
                            }
                    )
                    .onStatus(
                            HttpStatusCode::isError,
                            (request, clientResponse) -> {
                                log.atWarn()
                                        .setMessage("지역 검색 API가 오류 응답을 반환했습니다.")
                                        .addKeyValue("status", clientResponse.getStatusCode().value())
                                        .addKeyValue("failureType", "upstream_error")
                                        .addKeyValue("durationMs", elapsedMillis(startedAt))
                                        .log();
                                throw new BusinessException(ErrorCode.NAVER_DESTINATION_SEARCH_FAILED);
                            }
                )
                .body(String.class);
    }

    private LocalSearchResponse parseResponse(String responseBody, long durationMs) {
        if (!StringUtils.hasText(responseBody)) {
            log.atWarn()
                    .setMessage("지역 검색 API 응답이 비어 있습니다.")
                    .addKeyValue("failureType", "empty_response")
                    .addKeyValue("durationMs", durationMs)
                    .log();
            throw new BusinessException(ErrorCode.NAVER_DESTINATION_SEARCH_FAILED);
        }

        try {
            return objectMapper.readValue(responseBody, LocalSearchResponse.class);
        } catch (JacksonException exception) {
            log.atWarn()
                    .setMessage("지역 검색 API 응답을 해석하지 못했습니다.")
                    .addKeyValue("failureType", "parse_error")
                    .addKeyValue("cause", exception.getClass().getSimpleName())
                    .addKeyValue("durationMs", durationMs)
                    .log();
            throw new BusinessException(ErrorCode.NAVER_DESTINATION_SEARCH_FAILED);
        }
    }

    private long elapsedMillis(long startedAt) {
        return (System.nanoTime() - startedAt) / 1_000_000;
    }
}
