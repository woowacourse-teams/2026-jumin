package jumin.global.response;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor(access = AccessLevel.PRIVATE)
public final class ValidationError {

	private final String field;
	private final String message;

	public static ValidationError of(String field, String message) {
		return new ValidationError(field, message);
	}
}
