package jumin.domain.destination.client;

import jumin.config.LocalSearchProperties;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

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
        if (isMissingCredential(properties.clientId()) || isMissingCredential(properties.clientSecret())) {
            throw new BusinessException(ErrorCode.NAVER_DESTINATION_SEARCH_FAILED);
        }

        try {
            String responseBody = restClient.get()
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
                                throw new BusinessException(ErrorCode.DESTINATION_SEARCH_RATE_LIMITED);
                            }
                    )
                    .onStatus(
                            HttpStatusCode::isError,
                            (request, clientResponse) -> {
                                throw new BusinessException(ErrorCode.NAVER_DESTINATION_SEARCH_FAILED);
                            }
                    )
                    .body(String.class);

            return parseResponse(responseBody);
        } catch (RestClientException exception) {
            throw new BusinessException(ErrorCode.NAVER_DESTINATION_SEARCH_FAILED);
        }
    }

    private LocalSearchResponse parseResponse(String responseBody) {
        if (responseBody == null || responseBody.isBlank()) {
            throw new BusinessException(ErrorCode.NAVER_DESTINATION_SEARCH_FAILED);
        }

        try {
            return objectMapper.readValue(responseBody, LocalSearchResponse.class);
        } catch (JacksonException exception) {
            throw new BusinessException(ErrorCode.NAVER_DESTINATION_SEARCH_FAILED);
        }
    }

    private boolean isMissingCredential(String value) {
        return value == null || value.isBlank();
    }
}
