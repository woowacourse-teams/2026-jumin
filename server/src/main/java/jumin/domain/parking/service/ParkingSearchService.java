package jumin.domain.parking.service;

import java.time.Duration;
import java.util.List;
import jumin.domain.parking.dto.ParkingSearchRequest;
import jumin.domain.parking.dto.ParkingSearchResponse;
import jumin.domain.parking.dto.ParkingLotResponse;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parking.repository.ParkingLotRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ParkingSearchService {

    private static final int SEARCH_RADIUS_METERS = 600;

    private final ParkingLotRepository parkingLotRepository;
    private final ParkingSearchQueryValidator queryValidator;
    private final ParkingSearchResultCalculator resultCalculator;

    public ParkingSearchResponse search(ParkingSearchRequest request) {
        queryValidator.validate(request);
        Coordinate destination = new Coordinate(request.destinationLatitude(), request.destinationLongitude());
        List<ParkingLot> candidates = parkingLotRepository.findActiveWithinRadius(
                destination.latitude(),
                destination.longitude(),
                SEARCH_RADIUS_METERS);

        if (candidates.isEmpty()) {
            return ParkingSearchResponse.from(SEARCH_RADIUS_METERS, List.of());
        }

        int durationMinutes = Math.toIntExact(Duration.between(request.entryAt(), request.exitAt()).toMinutes());
        List<ParkingLotResponse> parkingLots = candidates.stream()
                .map(candidate -> resultCalculator.calculate(candidate, destination, request, durationMinutes))
                .toList();
        return ParkingSearchResponse.from(SEARCH_RADIUS_METERS, parkingLots);
    }
}
