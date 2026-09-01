package jumin.domain.parking.service;

import java.util.List;
import jumin.domain.parking.dto.ParkingViewportLotResponse;
import jumin.domain.parking.dto.ParkingViewportRequest;
import jumin.domain.parking.dto.ParkingViewportResponse;
import jumin.domain.parking.repository.ParkingLotRepository;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ParkingViewportService {

    private final ParkingLotRepository parkingLotRepository;

    public ParkingViewportResponse search(ParkingViewportRequest request) {
        validateCoordinateOrder(request);

        List<ParkingViewportLotResponse> parkingLots = parkingLotRepository.findActiveWithinViewport(
                        request.westLongitude(),
                        request.southLatitude(),
                        request.eastLongitude(),
                        request.northLatitude()
                ).stream()
                .map(ParkingViewportLotResponse::from)
                .toList();

        log.atInfo()
                .setMessage("지도 viewport 주차장 조회가 완료되었습니다.")
                .addKeyValue("resultCount", parkingLots.size())
                .log();

        return ParkingViewportResponse.from(parkingLots);
    }

    private void validateCoordinateOrder(ParkingViewportRequest request) {
        if (request.northLatitude() <= request.southLatitude()
                || request.westLongitude() >= request.eastLongitude()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT);
        }
    }
}
