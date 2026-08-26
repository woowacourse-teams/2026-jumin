package jumin.global.exception;

import jakarta.validation.ConstraintViolationException;
import java.util.List;
import jumin.global.response.ApiErrorResponse;
import jumin.global.response.ValidationErrorField;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<Object> handleBusinessException(BusinessException exception) {
        return createResponse(exception.getErrorCode());
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<Object> handleConstraintViolationException() {
        return createResponse(ErrorCode.INVALID_INPUT);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Object> handleUnexpectedException(Exception exception) {
        log.atError()
                .setMessage("예상하지 못한 예외가 발생했습니다.")
                .addKeyValue("status", HttpStatus.INTERNAL_SERVER_ERROR.value())
                .addKeyValue("exceptionType", exception.getClass().getSimpleName())
                .setCause(exception)
                .log();
        return createResponse(ErrorCode.INTERNAL_SERVER_ERROR);
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException exception,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request
    ) {
        List<ValidationErrorField> errors =
                exception.getBindingResult().getFieldErrors().stream()
                        .map(fieldError -> ValidationErrorField.of(
                                fieldError.getField(),
                                fieldError.getDefaultMessage()))
                        .toList();

        ApiErrorResponse response = ApiErrorResponse.of(ErrorCode.INVALID_INPUT.getMessage(), errors);

        return handleSpringMvcException(exception, response, headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleHandlerMethodValidationException(
            HandlerMethodValidationException exception,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request
    ) {
        if (exception.isForReturnValue()) {
            log.atError()
                    .setMessage("반환값 검증에 실패했습니다.")
                    .addKeyValue("status", HttpStatus.INTERNAL_SERVER_ERROR.value())
                    .addKeyValue("exceptionType", exception.getClass().getSimpleName())
                    .setCause(exception)
                    .log();

            ApiErrorResponse response = ApiErrorResponse.of(ErrorCode.INTERNAL_SERVER_ERROR.getMessage());

            return handleSpringMvcException(
                    exception,
                    response,
                    headers,
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    request
            );
        }

        ApiErrorResponse response = ApiErrorResponse.of(ErrorCode.INVALID_INPUT.getMessage());

        return handleSpringMvcException(
                exception,
                response,
                headers,
                status,
                request
        );
    }

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(
            HttpMessageNotReadableException exception,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request
    ) {
        ApiErrorResponse response = ApiErrorResponse.of(ErrorCode.INVALID_REQUEST_BODY.getMessage());

        return handleSpringMvcException(
                exception,
                response,
                headers,
                status,
                request
        );
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception exception,
            Object body,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request
    ) {
        if (status != null && status.is5xxServerError()) {
            log.atError()
                    .setMessage("Spring MVC 처리 중 서버 예외가 발생했습니다.")
                    .addKeyValue("status", status.value())
                    .addKeyValue("exceptionType", exception.getClass().getSimpleName())
                    .setCause(exception)
                    .log();
        }

        ApiErrorResponse response = ApiErrorResponse.of(resolveMessage(status));

        return super.handleExceptionInternal(
                exception,
                response,
                headers,
                status,
                request
        );
    }

    private ResponseEntity<Object> handleSpringMvcException(
            Exception exception,
            ApiErrorResponse response,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request
    ) {
        return super.handleExceptionInternal(
                exception,
                response,
                headers,
                status,
                request
        );
    }

    private ResponseEntity<Object> createResponse(ErrorCode errorCode) {
        return ResponseEntity.status(errorCode.getHttpStatus())
                .body(ApiErrorResponse.of(errorCode.getMessage()));
    }

    private String resolveMessage(HttpStatusCode status) {
        if (status == null || status.is5xxServerError()) {
            return ErrorCode.INTERNAL_SERVER_ERROR.getMessage();
        }

        return switch (status.value()) {
            case 400 -> ErrorCode.INVALID_INPUT.getMessage();
            case 404 -> ErrorCode.RESOURCE_NOT_FOUND.getMessage();
            case 405 -> ErrorCode.METHOD_NOT_ALLOWED.getMessage();
            case 415 -> ErrorCode.UNSUPPORTED_MEDIA_TYPE.getMessage();
            default -> "요청을 처리할 수 없습니다.";
        };
    }
}
