package jumin.domain.destination.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;

public record DestinationSearchRequest(
        String query,

        @DecimalMin(value = "-90.0")
        @DecimalMax(value = "90.0")
        Double latitude,

        @DecimalMin(value = "-180.0")
        @DecimalMax(value = "180.0")
        Double longitude
) {

    @AssertTrue(message = "위도와 경도는 함께 전달해야 합니다.")
    public boolean isCoordinatePairValid() {
        boolean latitudeWasProvided = latitude != null;
        boolean longitudeWasProvided = longitude != null;

        if (!latitudeWasProvided && !longitudeWasProvided) {
            return true;
        }

        return latitudeWasProvided && longitudeWasProvided;
    }
}
