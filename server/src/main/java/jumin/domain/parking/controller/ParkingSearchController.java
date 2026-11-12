package jumin.domain.parking.controller;

import jakarta.validation.Valid;
import java.util.UUID;
import jumin.domain.parking.service.ViewportSearchService;
import jumin.domain.parking.dto.ParkingLotViewportDetailResponse;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.domain.parking.dto.ParkingSearchResponse;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
import jumin.domain.parking.service.ParkingSearchService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/parking")
public class ParkingSearchController {

    private final ParkingSearchService parkingSearchService;
    private final ViewportSearchService viewportSearchService;

    @GetMapping("/search")
    public ResponseEntity<ParkingSearchResponse> search(@Valid @ModelAttribute ParkingSearchRequest request) {
        return ResponseEntity.ok(parkingSearchService.search(request));
    }

    @GetMapping("/viewport")
    public ResponseEntity<ParkingLotViewportResponses> searchViewport(
            @Valid @ModelAttribute ParkingLotViewportRequest request,
            @RequestHeader(value = "X-Guest-Id", required = false) String guestId
    ) {
        UUID parsedGuestId = null;
        if (guestId != null) {
            parsedGuestId = GuestIdParser.parse(guestId);
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).varyBy("X-Guest-Id")
                .contentType(MediaType.APPLICATION_JSON)
                .body(viewportSearchService.search(request, parsedGuestId));
    }

    @GetMapping("/viewport/{parkingLotId}")
    public ResponseEntity<ParkingLotViewportDetailResponse> parkingLotDetail(
            @PathVariable Long parkingLotId,
            @RequestHeader("X-Guest-Id") String guestId
    ) {
        return ResponseEntity.ok(
                parkingSearchService.getParkingLotDetail(parkingLotId, GuestIdParser.parse(guestId))
        );
    }
}
