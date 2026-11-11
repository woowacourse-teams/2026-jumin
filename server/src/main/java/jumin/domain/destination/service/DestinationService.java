package jumin.domain.destination.service;

import java.util.List;
import jumin.domain.destination.client.LocalSearchClient;
import jumin.domain.destination.client.LocalSearchResponse;
import jumin.domain.destination.dto.DestinationSearchRequest;
import jumin.domain.destination.dto.DestinationsResponse;
import jumin.domain.destination.mapper.DestinationResponseMapper;
import jumin.domain.destination.model.DestinationSearchQuery;
import jumin.domain.parking.entity.ParkingLot;
import jumin.domain.parking.repository.ParkingLotRepository;
import jumin.global.exception.BusinessException;
import jumin.global.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.CannotCreateTransactionException;

@Slf4j
@Service
@RequiredArgsConstructor
public class DestinationService {

    private final LocalSearchClient localSearchClient;
    private final DestinationResponseMapper responseMapper;
    private final ParkingLotRepository parkingLotRepository;

    public DestinationsResponse search(DestinationSearchRequest searchRequest) {
        DestinationSearchQuery searchQuery = new DestinationSearchQuery(searchRequest.query());
        LocalSearchResponse localSearchResponse = new LocalSearchResponse(List.of());
        boolean localSearchFailed = false;
        try {
            localSearchResponse = localSearchClient.search(
                    searchQuery.text(),
                    searchRequest.latitude(),
                    searchRequest.longitude()
            );
        } catch (BusinessException exception) {
            if (!isLocalSearchFailure(exception.getErrorCode())) {
                throw exception;
            }
            localSearchFailed = true;
            logSourceSearchFailure("KAKAO", exception.getClass().getSimpleName());
        }

        List<ParkingLot> parkingLots = List.of();
        boolean parkingSearchFailed = false;
        try {
            parkingLots = parkingLotRepository.findActiveByNameContaining(searchQuery.text());
        } catch (DataAccessException | CannotCreateTransactionException exception) {
            parkingSearchFailed = true;
            logSourceSearchFailure("PARKING_DB", exception.getClass().getSimpleName());
        }

        if (localSearchFailed && parkingSearchFailed) {
            throw new BusinessException(ErrorCode.DESTINATION_SEARCH_UNAVAILABLE);
        }
        return responseMapper.toResponse(searchQuery.text(), localSearchResponse, parkingLots);
    }

    private boolean isLocalSearchFailure(ErrorCode errorCode) {
        return errorCode == ErrorCode.DESTINATION_SEARCH_CLIENT_FAILED
                || errorCode == ErrorCode.DESTINATION_SEARCH_RATE_LIMITED;
    }

    private void logSourceSearchFailure(String source, String exceptionType) {
        log.atWarn().setMessage("목적지 검색 원천 조회에 실패했습니다.")
                .addKeyValue("source", source)
                .addKeyValue("exceptionType", exceptionType)
                .log();
    }
}
