package jumin.domain.admin.parking.service;

import java.util.List;
import jumin.domain.admin.parking.dto.AdminParkingLotReviewsResponse;
import jumin.domain.parking.entity.ParkingLotReview;
import jumin.domain.parking.repository.ParkingLotReviewRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class AdminParkingLotReviewService {

    private final ParkingLotReviewRepository parkingLotReviewRepository;

    public AdminParkingLotReviewsResponse getReviews() {
        List<ParkingLotReview> reviews = parkingLotReviewRepository.findAllByOrderByCreatedAtDesc();
        return AdminParkingLotReviewsResponse.from(reviews);
    }
}
