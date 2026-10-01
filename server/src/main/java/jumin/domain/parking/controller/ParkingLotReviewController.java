package jumin.domain.parking.controller;

import jakarta.validation.Valid;
import jumin.domain.parking.dto.ParkingReviewRequest;
import jumin.domain.parking.service.ParkingLotReviewService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/parking/review")
public class ParkingLotReviewController {

    private final ParkingLotReviewService parkingLotReviewService;

    @PostMapping
    public ResponseEntity<Void> create(@Valid @RequestBody ParkingReviewRequest request) {
        parkingLotReviewService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

}
