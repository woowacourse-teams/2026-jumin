package jumin.domain.destination.service;

import jumin.domain.destination.client.LocalSearchClient;
import jumin.domain.destination.client.LocalSearchResponse;
import jumin.domain.destination.dto.DestinationSearchRequest;
import jumin.domain.destination.dto.DestinationsResponse;
import jumin.domain.destination.mapper.DestinationResponseMapper;
import jumin.domain.destination.model.DestinationSearchQuery;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class DestinationService {

    private final LocalSearchClient localSearchClient;
    private final DestinationResponseMapper responseMapper;

    public DestinationsResponse search(DestinationSearchRequest searchRequest) {
        DestinationSearchQuery searchQuery = new DestinationSearchQuery(searchRequest.query());
        LocalSearchResponse localSearchResponse = localSearchClient.search(
                searchQuery.text(),
                searchRequest.latitude(),
                searchRequest.longitude()
        );
        return responseMapper.toResponse(searchQuery.text(), localSearchResponse);
    }
}
