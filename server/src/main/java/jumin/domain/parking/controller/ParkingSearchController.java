package jumin.domain.parking.controller;

import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import jumin.config.ViewportResponseCleanup;
import jumin.domain.parking.viewport.ViewportBody;
import jumin.domain.parking.viewport.ViewportSearchService;
import jumin.domain.parking.dto.ParkingLotViewportDetailResponse;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.domain.parking.dto.ParkingSearchResponse;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.domain.parking.service.ParkingSearchService;
import lombok.RequiredArgsConstructor;
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
    public ResponseEntity<?> searchViewport(
            @Valid @ModelAttribute ParkingLotViewportRequest request, HttpServletRequest servletRequest
    ) {
        ViewportBody body = viewportSearchService.search(request);
        servletRequest.setAttribute(ViewportResponseCleanup.BODY_ATTRIBUTE, body);
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(body.value());
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
