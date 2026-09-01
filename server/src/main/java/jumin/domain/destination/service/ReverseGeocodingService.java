package jumin.domain.destination.service;

import jumin.domain.destination.client.ReverseGeocodingResult;
import jumin.domain.destination.client.ReverseGeocodingClient;
import jumin.domain.destination.dto.ReverseGeocodeRequest;
import jumin.domain.destination.dto.ReverseGeocodeResponse;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class ReverseGeocodingService {

    private final ReverseGeocodingClient reverseGeocodingClient;

    public ReverseGeocodeResponse reverseGeocode(ReverseGeocodeRequest request) {
        ReverseGeocodingResult result = reverseGeocodingClient.reverseGeocode(
                request.latitude(),
                request.longitude()
        );

        if (StringUtils.hasText(result.buildingName())) {
            return new ReverseGeocodeResponse(result.buildingName());
        }
        if (StringUtils.hasText(result.roadAddress())) {
            return new ReverseGeocodeResponse(result.roadAddress());
        }
        throw new BusinessException(ErrorCode.DESTINATION_REVERSE_GEOCODING_NOT_FOUND);
    }
}
