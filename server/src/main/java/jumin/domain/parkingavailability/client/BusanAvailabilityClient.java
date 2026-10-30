package jumin.domain.parkingavailability.client;

import static jumin.domain.parkingavailability.client.AvailabilityPayloadSupport.MAX_PAGES;
import static jumin.domain.parkingavailability.client.AvailabilityPayloadSupport.PAGE_SIZE;
import static jumin.domain.parkingavailability.client.AvailabilityPayloadSupport.failure;
import static jumin.domain.parkingavailability.client.AvailabilityPayloadSupport.integer;
import static jumin.domain.parkingavailability.client.AvailabilityPayloadSupport.parse;
import static jumin.domain.parkingavailability.client.AvailabilityPayloadSupport.rows;
import static jumin.domain.parkingavailability.client.AvailabilityPayloadSupport.text;
import static jumin.domain.parkingavailability.client.AvailabilityPayloadSupport.timestamp;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import jumin.config.AvailabilityProperties;
import jumin.domain.parkingavailability.dto.AvailabilityObservation;
import jumin.domain.parkingavailability.entity.AvailabilityProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
public class BusanAvailabilityClient implements AvailabilityClient {

    private static final String PARKING_INFO_PATH = "/getParkingInfoList_v2";
    private static final Set<String> SUCCESS_CODES = Set.of("0", "00");
    private final RestClient restClient;
    private final AvailabilityProperties properties;
    private final ObjectMapper mapper;
    private final Clock clock;

    public BusanAvailabilityClient(
            @Qualifier("busanAvailabilityRestClient") RestClient restClient,
            AvailabilityProperties properties,
            ObjectMapper mapper,
            Clock clock
    ) {
        this.restClient = restClient;
        this.properties = properties;
        this.mapper = mapper;
        this.clock = clock;
    }

    @Override
    public AvailabilityProvider provider() {
        return AvailabilityProvider.BUSAN;
    }

    @Override
    public List<AvailabilityObservation> fetch() {
        String apiKey = apiKey();
        AvailabilityPageAccumulator accumulator = new AvailabilityPageAccumulator(provider());
        for (int pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber++) {
            AvailabilityPage page = fetchPage(apiKey, pageNumber);
            if (accumulator.add(page.total(), page.observations())) {
                return accumulator.observations();
            }
        }
        throw failure(provider(), "최대 수집 페이지 수를 초과했습니다.");
    }

    private AvailabilityPage fetchPage(String apiKey, int pageNumber) {
        JsonNode root = parse(mapper, request(apiKey, pageNumber), provider());
        Instant fetchedAt = clock.instant();
        JsonNode response = root.path("response");
        if (!SUCCESS_CODES.contains(text(response.path("header").path("resultCode")))) {
            throw failure(provider(), "제공기관이 오류를 반환했습니다.");
        }
        JsonNode body = response.path("body");
        List<AvailabilityObservation> observations = rows(body.path("items").path("item"), provider(), true)
                .stream()
                .map(row -> observation(row, fetchedAt))
                .toList();
        return new AvailabilityPage(integer(body.path("totalCount")), observations);
    }

    private String apiKey() {
        String configuredKey = properties.busan().apiKey();
        String apiKey = configuredKey == null ? null : configuredKey.trim();
        if (!StringUtils.hasText(apiKey)) {
            throw failure(provider(), "API 인증키가 설정되지 않았습니다.");
        }
        try {
            return apiKey.contains("%") ? URLDecoder.decode(apiKey, StandardCharsets.UTF_8) : apiKey;
        } catch (IllegalArgumentException exception) {
            throw failure(provider(), "API 인증키 인코딩이 올바르지 않습니다.");
        }
    }

    private String request(String apiKey, int page) {
        try {
            return restClient.get()
                    .uri(builder -> builder.path(PARKING_INFO_PATH)
                            .queryParam("pageNo", page)
                            .queryParam("numOfRows", PAGE_SIZE)
                            .queryParam("resultType", "json")
                            .queryParam("serviceKey", "{apiKey}")
                            .build(apiKey))
                    .retrieve()
                    .body(String.class);
        } catch (RestClientException | IllegalArgumentException exception) {
            throw failure(provider(), "외부 API 요청에 실패했습니다.");
        }
    }

    private AvailabilityObservation observation(JsonNode row, Instant fetchedAt) {
        Integer capacity = integer(row.path("maxcnt"));
        Integer occupied = integer(row.path("parkingcnt"));
        Integer available = integer(row.path("curravacnt"));
        Instant updatedAt = timestamp(row.path("lastupdatetime"));
        return new AvailabilityObservation(provider(), text(row.path("parkgcd")), text(row.path("parknm")),
                null, capacity, occupied, available, updatedAt, fetchedAt);
    }
}
