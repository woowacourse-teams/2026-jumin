package jumin.global.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public enum ErrorCode {

    INVALID_INPUT(HttpStatus.BAD_REQUEST, "요청 값이 올바르지 않습니다."),
    INVALID_REQUEST_BODY(HttpStatus.BAD_REQUEST, "요청 본문을 읽을 수 없습니다."),
    PARKING_LOT_NOT_FOUND(HttpStatus.NOT_FOUND, "주차장 정보를 찾을 수 없습니다."),
    RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND, "요청한 리소스를 찾을 수 없습니다."),
    METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "허용되지 않은 HTTP 메서드입니다."),
    UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "지원하지 않는 미디어 타입입니다."),
    INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "요청을 처리하는 중 서버 오류가 발생했습니다."),
    INVALID_QUERY(HttpStatus.BAD_REQUEST, "검색어는 2자 이상 입력해 주세요."),
    DESTINATION_SEARCH_RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "목적지 검색 요청이 너무 많습니다."),
    NAVER_DESTINATION_SEARCH_FAILED(HttpStatus.BAD_GATEWAY, "목적지를 검색하지 못했습니다."),
    ;

    private final HttpStatus httpStatus;
    private final String message;

    ErrorCode(HttpStatus httpStatus, String message) {
        this.httpStatus = httpStatus;
        this.message = message;
    }
}
