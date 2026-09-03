package jumin.domain.destination.controller;

import jakarta.validation.Valid;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/destinations")
public class DestinationController {

    private final DestinationService destinationService;
    private final ReverseGeocodingService reverseGeocodingService;

    @GetMapping("/search")
    public ResponseEntity<DestinationsResponse> search(
            @RequestParam(value = "query", required = false) String query
    ) {
        return ResponseEntity.ok(destinationService.search(query));
    }

    @GetMapping("/reverse-geocode")
    public ResponseEntity<ReverseGeocodeResponse> reverseGeocode(
            @Valid @ModelAttribute ReverseGeocodeRequest request
    ) {
        return ResponseEntity.ok(reverseGeocodingService.reverseGeocode(request));
    }
}
