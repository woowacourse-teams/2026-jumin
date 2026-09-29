package jumin.domain.admin.parking.exception;

import java.util.List;
import jumin.global.response.ValidationErrorField;
import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class ParkingCsvException extends RuntimeException {

    private final HttpStatus status;
    private final List<ValidationErrorField> errors;

    public ParkingCsvException(HttpStatus status, String message, List<ValidationErrorField> errors) {
        this(status, message, errors, null);
    }

    public ParkingCsvException(HttpStatus status, String message) {
        this(status, message, List.of());
    }

    public ParkingCsvException(HttpStatus status, String message, Throwable cause) {
        this(status, message, List.of(), cause);
    }

    private ParkingCsvException(
            HttpStatus status,
            String message,
            List<ValidationErrorField> errors,
            Throwable cause
    ) {
        super(message, cause);
        this.status = status;
        this.errors = List.copyOf(errors);
    }

    public static ParkingCsvException invalid(List<ValidationErrorField> errors) {
        return new ParkingCsvException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "CSV 파일의 형식이 올바르지 않습니다.",
                errors
        );
    }
}
