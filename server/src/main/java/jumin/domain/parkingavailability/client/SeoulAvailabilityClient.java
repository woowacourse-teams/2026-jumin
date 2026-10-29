package jumin.domain.parkingavailability.client;

import static jumin.domain.parkingavailability.client.AvailabilityPayloadSupport.MAX_PAGES;
import static jumin.domain.parkingavailability.client.AvailabilityPayloadSupport.PAGE_SIZE;
import static jumin.domain.parkingavailability.client.AvailabilityPayloadSupport.failure;
import static jumin.domain.parkingavailability.client.AvailabilityPayloadSupport.integer;
import static jumin.domain.parkingavailability.client.AvailabilityPayloadSupport.parse;
import static jumin.domain.parkingavailability.client.AvailabilityPayloadSupport.rows;
import static jumin.domain.parkingavailability.client.AvailabilityPayloadSupport.text;
import static jumin.domain.parkingavailability.client.AvailabilityPayloadSupport.timestamp;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
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
public class SeoulAvailabilityClient implements AvailabilityClient {

    private static final String SERVICE_NAME = "GetParkingInfo";
    private static final String SUCCESS_CODE = "INFO-000";
    private static final String REALTIME_ENABLED_STATUS = "1";

    private final RestClient restClient;
    private final AvailabilityProperties properties;
    private final ObjectMapper mapper;
    private final Clock clock;

    public SeoulAvailabilityClient(
            @Qualifier("seoulAvailabilityRestClient") RestClient restClient,
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
        return AvailabilityProvider.SEOUL;
    }

    @Override
    public List<AvailabilityObservation> fetch() {
        String apiKey = apiKey();
        AvailabilityPageAccumulator accumulator = new AvailabilityPageAccumulator(provider());
        for (int pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
            AvailabilityPage page = fetchPage(apiKey, pageIndex * PAGE_SIZE + 1);
            if (accumulator.add(page.total(), page.observations())) {
                return accumulator.observations();
            }
        }
        throw failure(provider(), "최대 수집 페이지 수를 초과했습니다.");
    }

    private String apiKey() {
        String configuredKey = properties.seoul().apiKey();
        String apiKey = configuredKey == null ? null : configuredKey.trim();
        if (!StringUtils.hasText(apiKey) || "sample".equals(apiKey)) {
            throw failure(provider(), "API 인증키가 설정되지 않았습니다.");
        }
        return apiKey;
    }

    private AvailabilityPage fetchPage(String apiKey, int start) {
        JsonNode root = parse(mapper, request(apiKey, start), provider());
        Instant fetchedAt = clock.instant();
        JsonNode body = root.path(SERVICE_NAME);
        if (!SUCCESS_CODE.equals(text(body.path("RESULT").path("CODE")))) {
            throw failure(provider(), "제공기관이 오류를 반환했습니다.");
        }
        List<AvailabilityObservation> observations = rows(body.path("row"), provider(), false).stream()
                .map(row -> observation(row, fetchedAt))
                .toList();
        return new AvailabilityPage(integer(body.path("list_total_count")), observations);
    }

    private String request(String apiKey, int start) {
        try {
            return restClient.get()
                    .uri(builder -> builder.pathSegment(apiKey, "json", SERVICE_NAME,
                            Integer.toString(start), Integer.toString(start + PAGE_SIZE - 1)).path("/").build())
                    .retrieve()
                    .body(String.class);
        } catch (RestClientException | IllegalArgumentException exception) {
            throw failure(provider(), "외부 API 요청에 실패했습니다.");
        }
    }

    private AvailabilityObservation observation(JsonNode row, Instant fetchedAt) {
        Integer capacity = integer(field(row, "TPKCT"));
        Integer occupied = integer(field(row, "NOW_PRK_VHCL_CNT"));
        String status = text(field(row, "PRK_STTS_YN"));
        Integer available = REALTIME_ENABLED_STATUS.equals(status) && capacity != null && occupied != null
                ? safeDifference(capacity, occupied) : null;
        Instant updatedAt = timestamp(field(row, "NOW_PRK_VHCL_UPDT_TM"));
        return new AvailabilityObservation(provider(), text(field(row, "PKLT_CD")),
                text(field(row, "PKLT_NM")), text(field(row, "ADDR")), capacity, occupied, available,
                updatedAt, fetchedAt);
    }

    private JsonNode field(JsonNode row, String name) {
        JsonNode value = row.path(name);
        return value.isMissingNode() ? row.path(name.toLowerCase(Locale.ROOT)) : value;
    }

    private Integer safeDifference(int capacity, int occupied) {
        long difference = (long) capacity - occupied;
        return difference >= Integer.MIN_VALUE && difference <= Integer.MAX_VALUE ? (int) difference : null;
    }
}
