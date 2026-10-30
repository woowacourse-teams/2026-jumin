package jumin.domain.destination.controller;

import jakarta.validation.Valid;
import jumin.domain.destination.dto.DestinationSearchRequest;
import jumin.domain.destination.dto.DestinationsResponse;
import jumin.domain.destination.dto.ReverseGeocodeRequest;
import jumin.domain.destination.dto.ReverseGeocodeResponse;
import jumin.domain.destination.service.DestinationService;
import jumin.domain.destination.service.ReverseGeocodingService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/destinations")
public class DestinationController {

    private final DestinationService destinationService;
    private final ReverseGeocodingService reverseGeocodingService;

    @GetMapping("/search")
    public ResponseEntity<DestinationsResponse> search(
            @Valid @ModelAttribute DestinationSearchRequest searchRequest
    ) {
        return ResponseEntity.ok(destinationService.search(searchRequest));
    }

    @GetMapping("/reverse-geocode")
    public ResponseEntity<ReverseGeocodeResponse> reverseGeocode(
            @Valid @ModelAttribute ReverseGeocodeRequest reverseGeocodeRequest
    ) {
        return ResponseEntity.ok(reverseGeocodingService.reverseGeocode(reverseGeocodeRequest));
    }
}
