package jumin.domain.destination.client;

import jumin.config.LocalSearchProperties;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Component
public class LocalSearchClient {

    private static final int MAX_RESULT_COUNT = 15;

    private final RestClient restClient;
    private final LocalSearchProperties localSearchProperties;
    private final ObjectMapper objectMapper;

    public LocalSearchClient(
            @Qualifier("localSearchRestClient") RestClient restClient,
            LocalSearchProperties localSearchProperties,
            ObjectMapper objectMapper
    ) {
        this.restClient = restClient;
        this.localSearchProperties = localSearchProperties;
        this.objectMapper = objectMapper;
    }

    public LocalSearchResponse search(
            String searchQuery,
            Double latitude,
            Double longitude
    ) {
        if (!StringUtils.hasText(localSearchProperties.restApiKey())) {
            throw new BusinessException(ErrorCode.DESTINATION_SEARCH_CLIENT_FAILED);
        }
        try {
            String upstreamResponseBody = restClient.get()
                    .uri(uriBuilder -> {
                        uriBuilder.path("/v2/local/search/keyword.json")
                                .queryParam("query", searchQuery)
                                .queryParam("size", MAX_RESULT_COUNT)
                                .queryParam("sort", "accuracy");
                        // 위치는 보조 조건이며, 원문 검색어나 검색 반경을 변경하지 않는다.
                        if (latitude != null && longitude != null) {
                            uriBuilder.queryParam("x", longitude);
                            uriBuilder.queryParam("y", latitude);
                        }
                        return uriBuilder.build();
                    })
                    .header(HttpHeaders.AUTHORIZATION, "KakaoAK " + localSearchProperties.restApiKey())
                    .retrieve()
                    .onStatus(httpStatus -> httpStatus.value() == 429, (httpRequest, httpResponse) -> {
                        throw new BusinessException(ErrorCode.DESTINATION_SEARCH_RATE_LIMITED);
                    })
                    .onStatus(HttpStatusCode::isError, (httpRequest, httpResponse) -> {
                        throw new BusinessException(ErrorCode.DESTINATION_SEARCH_CLIENT_FAILED);
                    })
                    .body(String.class);
            if (!StringUtils.hasText(upstreamResponseBody)) {
                throw new BusinessException(ErrorCode.DESTINATION_SEARCH_CLIENT_FAILED);
            }
            LocalSearchResponse searchResponse = objectMapper.readValue(
                    upstreamResponseBody,
                    LocalSearchResponse.class
            );
            if (searchResponse == null || searchResponse.places() == null) {
                throw new BusinessException(ErrorCode.DESTINATION_SEARCH_CLIENT_FAILED);
            }
            return searchResponse;
        } catch (RestClientException | JacksonException searchApiException) {
            log.warn("카카오 장소 검색 실패: {}", searchApiException.getClass().getSimpleName());
            throw new BusinessException(ErrorCode.DESTINATION_SEARCH_CLIENT_FAILED);
        }
    }
}
