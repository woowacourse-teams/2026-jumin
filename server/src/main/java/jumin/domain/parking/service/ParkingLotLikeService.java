package jumin.domain.parking.service;

import java.util.UUID;
import jumin.domain.parking.dto.ParkingLikeResponse;
import jumin.domain.parking.repository.ParkingLotLikeRepository;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class ParkingLotLikeService {

    private final ParkingLotLikeRepository parkingLotLikeRepository;

    @Transactional
    public ParkingLikeResponse like(Long parkingLotId, UUID anonymousId) {
        lockParkingLot(parkingLotId);
        parkingLotLikeRepository.insertIfAbsent(parkingLotId, anonymousId);
        return new ParkingLikeResponse(
                parkingLotId,
                parkingLotLikeRepository.countByParkingLotId(parkingLotId),
                true
        );
    }

    @Transactional
    public ParkingLikeResponse unlike(Long parkingLotId, UUID anonymousId) {
        lockParkingLot(parkingLotId);
        parkingLotLikeRepository.delete(parkingLotId, anonymousId);
        return new ParkingLikeResponse(
                parkingLotId,
                parkingLotLikeRepository.countByParkingLotId(parkingLotId),
                false
        );
    }

    private void lockParkingLot(Long parkingLotId) {
        if (!parkingLotLikeRepository.lockActiveParkingLot(parkingLotId)) {
            throw new BusinessException(ErrorCode.PARKING_LOT_NOT_FOUND);
        }
    }
}
