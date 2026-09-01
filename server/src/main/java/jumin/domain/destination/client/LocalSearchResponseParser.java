package jumin.domain.destination.client;

import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.util.StringUtils;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@Slf4j
final class LocalSearchResponseParser {

    private final ObjectMapper objectMapper;

    LocalSearchResponseParser(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    LocalSearchResponse parse(String responseBody, long durationMs) {
        if (!StringUtils.hasText(responseBody)) {
            log.atWarn()
                    .setMessage("지역 검색 API 응답이 비어 있습니다.")
                    .addKeyValue("failureType", "empty_response")
                    .addKeyValue("durationMs", durationMs)
                    .log();
            throw new BusinessException(ErrorCode.DESTINATION_SEARCH_CLIENT_FAILED);
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
            throw new BusinessException(ErrorCode.DESTINATION_SEARCH_CLIENT_FAILED);
        }
    }
}
