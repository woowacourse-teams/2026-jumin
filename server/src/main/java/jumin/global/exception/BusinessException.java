package jumin.global.exception;

import java.util.Objects;
import lombok.Getter;

@Getter
public class BusinessException extends RuntimeException {

	private final ErrorCode errorCode;

	public BusinessException(ErrorCode errorCode) {
		super(Objects.requireNonNull(errorCode).getMessage());
		this.errorCode = errorCode;
	}
}
