package jumin.domain.parking.controller;

import jakarta.validation.Valid;
import jumin.domain.parking.dto.ParkingReviewRequest;
import jumin.domain.parking.service.ParkingReviewService;
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
public class ParkingReviewController {

    private final ParkingReviewService parkingReviewService;

    @PostMapping
    public ResponseEntity<Void> create(@Valid @RequestBody ParkingReviewRequest request) {
        parkingReviewService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

}
