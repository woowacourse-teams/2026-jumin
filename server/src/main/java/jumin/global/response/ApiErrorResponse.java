package jumin.global.response;

import java.util.List;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor(access = AccessLevel.PRIVATE)
public final class ApiErrorResponse {

    private final String message;
    private final List<ValidationErrorField> errors;

    public static ApiErrorResponse of(String message) {
        return new ApiErrorResponse(message, List.of());
    }

    public static ApiErrorResponse of(String message, List<ValidationErrorField> errors) {
        return new ApiErrorResponse(message, List.copyOf(errors));
    }
}
