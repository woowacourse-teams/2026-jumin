package jumin.domain.parking.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

public record ParkingViewportRequest(
        @NotNull(message = "서쪽 경도는 필수입니다.")
        @DecimalMin(value = "-180.0", message = "서쪽 경도는 -180 이상이어야 합니다.")
        @DecimalMax(value = "180.0", message = "서쪽 경도는 180 이하이어야 합니다.")
        Double westLongitude,

        @NotNull(message = "남쪽 위도는 필수입니다.")
        @DecimalMin(value = "-90.0", inclusive = false, message = "남쪽 위도는 -90보다 커야 합니다.")
        @DecimalMax(value = "90.0", inclusive = false, message = "남쪽 위도는 90보다 작아야 합니다.")
        Double southLatitude,

        @NotNull(message = "동쪽 경도는 필수입니다.")
        @DecimalMin(value = "-180.0", message = "동쪽 경도는 -180 이상이어야 합니다.")
        @DecimalMax(value = "180.0", message = "동쪽 경도는 180 이하이어야 합니다.")
        Double eastLongitude,

        @NotNull(message = "북쪽 위도는 필수입니다.")
        @DecimalMin(value = "-90.0", inclusive = false, message = "북쪽 위도는 -90보다 커야 합니다.")
        @DecimalMax(value = "90.0", inclusive = false, message = "북쪽 위도는 90보다 작아야 합니다.")
        Double northLatitude
) {
}
