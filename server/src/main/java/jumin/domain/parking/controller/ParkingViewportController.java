package jumin.domain.parking.controller;

import jakarta.validation.Valid;
import jumin.domain.parking.dto.ParkingViewportRequest;
import jumin.domain.parking.dto.ParkingViewportResponse;
import jumin.domain.parking.service.ParkingViewportService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/parking")
public class ParkingViewportController {

    private final ParkingViewportService parkingViewportService;

    @GetMapping("/viewport")
    public ResponseEntity<ParkingViewportResponse> search(
            @Valid @ModelAttribute ParkingViewportRequest request
    ) {
        return ResponseEntity.ok(parkingViewportService.search(request));
    }
}
