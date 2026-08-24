package jumin.domain.parking.controller;

import jakarta.validation.Valid;
import jumin.domain.parking.dto.ParkingLotDetailResponse;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.domain.parking.service.ParkingLotDetailService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/parking")
public class ParkingLotDetailController {

    private final ParkingLotDetailService parkingLotDetailService;

    @GetMapping("/{parkingLotId}")
    public ResponseEntity<ParkingLotDetailResponse> detail(
            @PathVariable Long parkingLotId,
            @Valid @ModelAttribute ParkingSearchRequest request
    ) {
        return ResponseEntity.ok(parkingLotDetailService.getDetail(parkingLotId, request));
    }
}
