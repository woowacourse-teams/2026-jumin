package jumin.domain.admin.parking.controller;

import jumin.domain.admin.parking.dto.AdminParkingLotReviewsResponse;
import jumin.domain.admin.parking.service.AdminParkingLotReviewService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin/parking/review")
public class AdminParkingLotReviewController {

    private final AdminParkingLotReviewService adminParkingLotReviewService;

    @GetMapping
    public ResponseEntity<AdminParkingLotReviewsResponse> getReviews() {
        AdminParkingLotReviewsResponse response = adminParkingLotReviewService.getReviews();
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(response);
    }

}
