package jumin.global.response;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor(access = AccessLevel.PRIVATE)
public final class ValidationErrorField {

    private final String field;
    private final String message;

    public static ValidationErrorField of(String field, String message) {
        return new ValidationErrorField(field, message);
    }
}
