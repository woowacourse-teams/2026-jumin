package jumin.domain.destination.service;

import java.util.Objects;
import jumin.domain.destination.client.LocalSearchClient;
import jumin.domain.destination.client.LocalSearchPlace;
import jumin.domain.destination.client.LocalSearchResponse;
import jumin.domain.destination.dto.DestinationResponse;
import jumin.domain.destination.dto.DestinationsResponse;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

@Service
@RequiredArgsConstructor
public class DestinationService {

    private static final int MAX_DESTINATIONS = 5;
    private static final int MIN_QUERY_LENGTH = 2;

    private final LocalSearchClient localSearchClient;

    public DestinationsResponse search(String rawQuery) {
        if (rawQuery == null) {
            throw new BusinessException(ErrorCode.INVALID_QUERY);
        }

        String query = rawQuery.trim();
        if (query.length() < MIN_QUERY_LENGTH) {
            throw new BusinessException(ErrorCode.INVALID_QUERY);
        }

        LocalSearchResponse response = localSearchClient.search(query);

        return DestinationsResponse.from(
            query,
            response.items().stream()
                .map(this::mapLocalSearchPlace)
                .filter(Objects::nonNull)
                .limit(MAX_DESTINATIONS)
                .toList()
        );
    }

    private DestinationResponse mapLocalSearchPlace(LocalSearchPlace place) {
        String name = removeHtml(place.title());
        String address = removeHtml(place.address());
        if (name.isBlank() || address.isBlank()) {
            return null;
        }

        String roadAddress = removeHtmlOrNull(place.roadAddress());

        try {
            GeoCoordinate coordinate = LocalSearchCoordinateMapper.toGeoCoordinate(place.mapx(), place.mapy());
            return DestinationResponse.from(
                createDestinationId(place, name),
                name,
                address,
                roadAddress,
                coordinate.latitude(),
                coordinate.longitude()
            );
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private String removeHtmlOrNull(String value) {
        String cleanedValue = removeHtml(value);
        if (cleanedValue.isBlank()) {
            return null;
        }
        return cleanedValue;
    }

    private String removeHtml(String value) {
        if (value == null) {
            return "";
        }
        return HtmlUtils.htmlUnescape(value.replaceAll("<[^>]*>", "")).trim();
    }

    private String createDestinationId(
            LocalSearchPlace place,
            String name
    ) {
        return String.join("_", "naver", place.mapx(), place.mapy(), name);
    }
}
