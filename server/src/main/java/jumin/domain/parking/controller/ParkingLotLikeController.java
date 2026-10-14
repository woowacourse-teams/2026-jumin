package jumin.domain.parking.controller;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import java.util.UUID;
import jumin.domain.parking.dto.ParkingLikeResponse;
import jumin.domain.parking.service.ParkingLotLikeService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/parking/{parkingLotId}/like")
public class ParkingLotLikeController {

    private static final String UUID_V4 =
            "(?i)^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";

    private final ParkingLotLikeService parkingLotLikeService;

    @PutMapping
    public ResponseEntity<ParkingLikeResponse> like(
            @PathVariable @Positive Long parkingLotId,
            @RequestHeader("X-Anonymous-Id") @Pattern(regexp = UUID_V4) String anonymousId
    ) {
        return ResponseEntity.ok(
                parkingLotLikeService.like(parkingLotId, UUID.fromString(anonymousId))
        );
    }

    @DeleteMapping
    public ResponseEntity<ParkingLikeResponse> unlike(
            @PathVariable @Positive Long parkingLotId,
            @RequestHeader("X-Anonymous-Id") @Pattern(regexp = UUID_V4) String anonymousId
    ) {
        return ResponseEntity.ok(
                parkingLotLikeService.unlike(parkingLotId, UUID.fromString(anonymousId))
        );
    }

}
