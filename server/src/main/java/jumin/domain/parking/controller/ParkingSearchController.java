package jumin.domain.parking.controller;

import jakarta.validation.Valid;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.domain.parking.dto.ParkingSearchResponse;
import jumin.domain.parking.dto.ParkingViewportRequest;
import jumin.domain.parking.dto.ParkingViewportResponse;
import jumin.domain.parking.service.ParkingSearchService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/parking")
public class ParkingSearchController {

    private final ParkingSearchService parkingSearchService;

    @GetMapping("/search")
    public ResponseEntity<ParkingSearchResponse> search(@Valid @ModelAttribute ParkingSearchRequest request) {
        return ResponseEntity.ok(parkingSearchService.search(request));
    }

    @GetMapping("/viewport")
    public ResponseEntity<ParkingViewportResponse> searchViewport(
            @Valid @ModelAttribute ParkingViewportRequest request
    ) {
        return ResponseEntity.ok(parkingSearchService.searchViewport(request));
    }
}
