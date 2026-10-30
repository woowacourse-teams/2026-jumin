package jumin.global.exception;

import java.util.Objects;
import java.util.regex.Pattern;
import lombok.Getter;

@Getter
public class BusinessException extends RuntimeException {

    private static final Pattern REASON_PATTERN = Pattern.compile("[A-Z0-9_]{1,64}");

    private final ErrorCode errorCode;
    private final String reason;

    public BusinessException(ErrorCode errorCode) {
        super(Objects.requireNonNull(errorCode).getMessage());
        this.errorCode = errorCode;
        this.reason = null;
    }

    public BusinessException(ErrorCode errorCode, Throwable cause) {
        this(errorCode, null, cause);
    }

    public BusinessException(ErrorCode errorCode, String reason, Throwable cause) {
        super(Objects.requireNonNull(errorCode).getMessage(), cause);
        if (reason != null && !REASON_PATTERN.matcher(reason).matches()) {
            throw new IllegalArgumentException("Invalid exception reason");
        }
        this.errorCode = errorCode;
        this.reason = reason;
    }
}
