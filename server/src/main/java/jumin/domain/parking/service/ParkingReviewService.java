package jumin.domain.parking.service;

import jakarta.validation.Valid;
import jumin.domain.parking.dto.ParkingReviewRequest;
import jumin.domain.parking.entity.ParkingLotReview;
import jumin.domain.parking.repository.ParkingLotRepository;
import jumin.domain.parking.repository.ParkingLotReviewRepository;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class ParkingReviewService {

    private final ParkingLotReviewRepository parkingLotReviewRepository;
    private final ParkingLotRepository parkingLotRepository;

    @Transactional
    public void create(@Valid ParkingReviewRequest request) {
        var parkingLot = parkingLotRepository.findActiveById(request.parkingLotId())
                .orElseThrow(() -> new BusinessException(ErrorCode.PARKING_LOT_NOT_FOUND));
        ParkingLotReview review = new ParkingLotReview(
                parkingLot,
                request.detail()
        );
        parkingLotReviewRepository.save(review);
    }
}
