package jumin.domain.parking.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.time.OffsetDateTime;
import org.springframework.format.annotation.DateTimeFormat;

public record ParkingSearchRequest(
        @NotNull(message = "목적지 위도는 필수입니다.")
        @DecimalMin(value = "-90.0", message = "목적지 위도는 -90 이상이어야 합니다.")
        @DecimalMax(value = "90.0", message = "목적지 위도는 90 이하이어야 합니다.")
        Double destinationLatitude,

        @NotNull(message = "목적지 경도는 필수입니다.")
        @DecimalMin(value = "-180.0", message = "목적지 경도는 -180 이상이어야 합니다.")
        @DecimalMax(value = "180.0", message = "목적지 경도는 180 이하이어야 합니다.")
        Double destinationLongitude,

        @NotNull(message = "입차 시간은 필수입니다.")
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
        OffsetDateTime entryAt,

        @NotNull(message = "출차 시간은 필수입니다.")
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
        OffsetDateTime exitAt
) {
}
