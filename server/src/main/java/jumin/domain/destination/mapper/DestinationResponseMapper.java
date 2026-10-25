package jumin.domain.destination.mapper;

import java.util.List;
import java.util.Objects;
import jumin.domain.destination.client.LocalSearchPlace;
import jumin.domain.destination.client.LocalSearchResponse;
import jumin.domain.destination.dto.DestinationResponse;
import jumin.domain.destination.dto.DestinationsResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class DestinationResponseMapper {

    public DestinationsResponse toResponse(
            String normalizedQuery,
            LocalSearchResponse localSearchResponse
    ) {
        List<DestinationResponse> destinationResponses = localSearchResponse.places().stream()
                .map(this::toDestination)
                .filter(Objects::nonNull)
                .toList();
        return DestinationsResponse.from(normalizedQuery, destinationResponses);
    }

    private DestinationResponse toDestination(LocalSearchPlace localSearchPlace) {
        if (hasMissingRequiredPlaceFields(localSearchPlace)) {
            return null;
        }

        double latitude;
        double longitude;
        try {
            latitude = Double.parseDouble(localSearchPlace.latitude());
            longitude = Double.parseDouble(localSearchPlace.longitude());
        } catch (NumberFormatException invalidCoordinate) {
            return null;
        }

        if (hasInvalidCoordinates(latitude, longitude)) {
            return null;
        }
        return DestinationResponse.from(
                "kakao_" + localSearchPlace.placeId(),
                localSearchPlace.placeName(),
                localSearchPlace.addressName(),
                toOptionalRoadAddress(localSearchPlace.roadAddressName()),
                latitude,
                longitude
        );
    }

    private boolean hasMissingRequiredPlaceFields(LocalSearchPlace localSearchPlace) {
        return localSearchPlace == null
                || !StringUtils.hasText(localSearchPlace.placeId())
                || !StringUtils.hasText(localSearchPlace.placeName())
                || !StringUtils.hasText(localSearchPlace.addressName())
                || !StringUtils.hasText(localSearchPlace.latitude())
                || !StringUtils.hasText(localSearchPlace.longitude());
    }

    private boolean hasInvalidCoordinates(double latitude, double longitude) {
        boolean invalidLatitude = !Double.isFinite(latitude) || latitude < -90 || latitude > 90;
        boolean invalidLongitude = !Double.isFinite(longitude) || longitude < -180 || longitude > 180;
        return invalidLatitude || invalidLongitude;
    }

    private String toOptionalRoadAddress(String candidateRoadAddress) {
        if (!StringUtils.hasText(candidateRoadAddress)) {
            return null;
        }
        return candidateRoadAddress;
    }
}
