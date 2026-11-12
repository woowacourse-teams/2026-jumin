package jumin.domain.parking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.jayway.jsonpath.JsonPath;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;
import jumin.TestcontainersConfiguration;
import jumin.domain.parking.model.ViewportDeadline;
import jumin.domain.parking.repository.ViewportRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ParkingLotLikeIntegrationTest {

    private static final String GUEST_ID = "550e8400-e29b-41d4-a716-446655440000";

    private final HttpClient client = HttpClient.newHttpClient();

    @LocalServerPort
    private int port;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ViewportRepository viewportRepository;

    @Autowired
    private PlatformTransactionManager transactions;

    private Long lotId;

    @BeforeEach
    void setUp() {
        lotId = insertLot(true);
    }

    @Test
    @DisplayName("반복 요청과 서로 다른 게스트 ID의 좋아요를 독립적으로 처리한다")
    void repeated_requests_and_different_guest_ids_are_isolated() throws Exception {
        assertState(send("PUT", lotId, GUEST_ID), lotId, 1, true);
        assertState(send("PUT", lotId, GUEST_ID.toUpperCase()), lotId, 1, true);
        String otherGuestId = UUID.randomUUID().toString();
        assertState(send("PUT", lotId, otherGuestId), lotId, 2, true);

        Long otherLotId = insertLot(true);
        assertState(send("PUT", otherLotId, GUEST_ID), otherLotId, 1, true);
        assertState(send("DELETE", lotId, UUID.randomUUID().toString()), lotId, 2, false);
        assertState(send("DELETE", lotId, GUEST_ID), lotId, 1, false);
        assertState(send("DELETE", lotId, GUEST_ID), lotId, 1, false);
        assertThat(count(lotId)).isEqualTo(1);
        assertThat(count(otherLotId)).isEqualTo(1);
        assertState(send("PUT", lotId, GUEST_ID), lotId, 2, true);
        assertThat(jdbc.queryForObject(
                """
                select count(*)
                from parking_likes
                where parking_lot_id = ? and created_at is not null
                """,
                Long.class,
                lotId
        )).isEqualTo(2);
    }

    @Test
    @DisplayName("viewport 상세 조회에 전체 좋아요 수와 요청자의 좋아요 여부를 함께 반환한다")
    void viewport_detail_returns_like_summary_for_requested_guest_id() throws Exception {
        assertState(send("PUT", lotId, GUEST_ID), lotId, 1, true);

        HttpResponse<String> likedResponse = sendViewportDetail(lotId, GUEST_ID);
        assertThat(likedResponse.statusCode()).isEqualTo(200);
        assertThat(JsonPath.<Number>read(likedResponse.body(), "$.likeCount").longValue()).isEqualTo(1);
        assertThat(JsonPath.<Boolean>read(likedResponse.body(), "$.likedByMe")).isTrue();

        HttpResponse<String> unlikedResponse = sendViewportDetail(lotId, UUID.randomUUID().toString());
        assertThat(unlikedResponse.statusCode()).isEqualTo(200);
        assertThat(JsonPath.<Number>read(unlikedResponse.body(), "$.likeCount").longValue()).isEqualTo(1);
        assertThat(JsonPath.<Boolean>read(unlikedResponse.body(), "$.likedByMe")).isFalse();
    }

    // 실제 좋아요 저장 결과가 지도 목록에 반영되고 취소 후에도 남지 않는지 확인한다.
    @Test
    @DisplayName("지도 목록에 요청자별 좋아요와 좋아요 취소 결과를 반영한다")
    void viewport_list_reflects_likes_and_unlikes_for_each_guest() throws Exception {
        jdbc.update("update parking_lots set latitude = 37.5665, longitude = 126.978 where id = ?", lotId);
        Long otherLotId = insertLot(true);
        jdbc.update("update parking_lots set latitude = 37.5665, longitude = 126.978 where id = ?", otherLotId);
        String otherGuest = UUID.randomUUID().toString();

        // 두 사용자가 서로 다른 주차장을 좋아요한 상태를 만든다.
        assertState(send("PUT", lotId, GUEST_ID), lotId, 1, true);
        assertState(send("PUT", otherLotId, otherGuest), otherLotId, 1, true);
        assertViewportLike(lotId, GUEST_ID, true);
        assertViewportLike(otherLotId, GUEST_ID, false);
        assertViewportLike(lotId, otherGuest, false);
        assertViewportLike(otherLotId, otherGuest, true);

        // 같은 지도 영역을 다시 조회하면 좋아요 취소 결과를 즉시 확인할 수 있다.
        assertState(send("DELETE", lotId, GUEST_ID), lotId, 0, false);
        assertViewportLike(lotId, GUEST_ID, false);
    }

    @Test
    @DisplayName("게스트별 좋아요를 PostgreSQL에서 조회하고 게스트 선두 인덱스를 사용할 수 있다")
    void reads_guest_likes_with_guest_leading_index() {
        // UUID 파라미터와 게스트별 조회를 실제 드라이버·마이그레이션 환경에서 확인한다.
        UUID guestId = UUID.randomUUID();
        Long otherLotId = insertLot(true);
        jdbc.update("insert into parking_likes (parking_lot_id, anonymous_id) values (?, ?), (?, ?)",
                lotId, guestId, otherLotId, guestId);
        assertThat(viewportRepository.findLikedParkingLotIds(guestId,
                ViewportDeadline.after(Duration.ofSeconds(5)))).containsExactlyInAnyOrder(lotId, otherLotId);
        assertThat(viewportRepository.findLikedParkingLotIds(UUID.randomUUID(),
                ViewportDeadline.after(Duration.ofSeconds(5)))).isEmpty();

        // 소규모 테스트 데이터의 순차 탐색 선호를 배제하고 인덱스 접근 가능성만 검증한다.
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            status.setRollbackOnly();
            jdbc.execute("SET LOCAL enable_seqscan = off");
            List<String> plan = jdbc.queryForList(
                    "EXPLAIN SELECT parking_lot_id FROM parking_likes WHERE anonymous_id = ?",
                    String.class, guestId);
            assertThat(String.join("\n", plan)).contains("idx_parking_likes_anonymous_id_parking_lot_id");
        });
    }

    private void assertViewportLike(Long parkingLotId, String guestId, boolean liked) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port
                        + "/api/parking/viewport?westLongitude=126.977&southLatitude=37.566"
                        + "&eastLongitude=126.979&northLatitude=37.567"))
                .timeout(Duration.ofSeconds(15))
                .header("X-Guest-Id", guestId).GET().build();
        var response = client.send(request, HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        List<Boolean> values = JsonPath.read(response.body(),
                "$.parkingLots[?(@.id == " + parkingLotId + ")].likedByMe");
        assertThat(values).containsExactly(liked);
    }

    @Test
    @DisplayName("중복 및 서로 다른 게스트 ID의 동시 요청을 정확히 집계한다")
    void concurrent_duplicate_and_distinct_requests_do_not_overcount() throws Exception {
        for (HttpResponse<String> response : concurrent("PUT", Collections.nCopies(12, GUEST_ID))) {
            assertState(response, lotId, 1, true);
        }
        assertThat(count(lotId)).isEqualTo(1);
        List<String> guestIds = IntStream.range(0, 12)
                .mapToObj(i -> UUID.randomUUID().toString())
                .toList();
        for (HttpResponse<String> response : concurrent("PUT", guestIds)) {
            assertThat(response.statusCode()).isEqualTo(200);
        }
        assertThat(count(lotId)).isEqualTo(13);
        for (HttpResponse<String> response : concurrent("DELETE", Collections.nCopies(12, GUEST_ID))) {
            assertState(response, lotId, 12, false);
        }
        assertThat(count(lotId)).isEqualTo(12);
        for (HttpResponse<String> response : concurrent("DELETE", guestIds)) {
            assertThat(response.statusCode()).isEqualTo(200);
        }
        assertThat(count(lotId)).isZero();
    }

    @Test
    @DisplayName("잘못된 요청과 미존재 또는 비활성 주차장의 좋아요는 변경하지 않는다")
    void invalid_or_unavailable_lots_cannot_be_mutated() throws Exception {
        Long inactiveLotId = insertLot(false);
        for (String method : List.of("PUT", "DELETE")) {
            for (Long unavailable : List.of(Long.MAX_VALUE, inactiveLotId)) {
                HttpResponse<String> response = send(method, unavailable, GUEST_ID);
                assertThat(response.statusCode()).isEqualTo(404);
                assertThat(JsonPath.<String>read(response.body(), "$.message"))
                        .isEqualTo("주차장 정보를 찾을 수 없습니다.");
            }
            for (String invalidGuestId : List.of("invalid", "550e8400-e29b-11d4-a716-446655440000")) {
                assertThat(send(method, lotId, invalidGuestId).statusCode()).isEqualTo(400);
            }
            assertThat(send(method, lotId, null).statusCode()).isEqualTo(400);
            assertThat(send(method, 0L, GUEST_ID).statusCode()).isEqualTo(400);
        }
        assertThat(count(lotId)).isZero();
        assertThat(count(inactiveLotId)).isZero();
    }

    @Test
    @DisplayName("DB에서 좋아요 중복과 주차장 외래 키 제약을 보장한다")
    void database_enforces_unique_identity_and_foreign_key() throws Exception {
        assertState(send("PUT", lotId, GUEST_ID), lotId, 1, true);
        assertThatThrownBy(() -> jdbc.update(
                "insert into parking_likes (parking_lot_id, anonymous_id) values (?, ?)",
                lotId,
                UUID.fromString(GUEST_ID)
        )).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(
                "insert into parking_likes (parking_lot_id, anonymous_id) values (?, ?)",
                Long.MAX_VALUE,
                UUID.randomUUID()
        )).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("delete from parking_lots where id = ?", lotId))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(count(lotId)).isEqualTo(1);
    }

    private List<HttpResponse<String>> concurrent(
            String method,
            List<String> guestIds
    ) throws Exception {
        try (var executor = Executors.newFixedThreadPool(6)) {
            List<Callable<HttpResponse<String>>> calls = guestIds.stream()
                    .<Callable<HttpResponse<String>>>map(guestId -> () -> send(method, lotId, guestId))
                    .toList();
            var futures = executor.invokeAll(calls, 30, TimeUnit.SECONDS);
            List<HttpResponse<String>> responses = new ArrayList<>();
            for (var future : futures) {
                responses.add(future.get());
            }
            return responses;
        }
    }

    private HttpResponse<String> send(
            String method,
            Long parkingLotId,
            String guestId
    ) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create(
                "http://localhost:" + port + "/api/parking/" + parkingLotId + "/like"
        ))
                .timeout(Duration.ofSeconds(15))
                .method(method, HttpRequest.BodyPublishers.noBody());
        if (guestId != null) {
            builder.header("X-Guest-Id", guestId);
        }
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> sendViewportDetail(Long parkingLotId, String guestId) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(
                        "http://localhost:" + port + "/api/parking/viewport/" + parkingLotId
                ))
                .timeout(Duration.ofSeconds(15))
                .header("X-Guest-Id", guestId)
                .GET()
                .build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private void assertState(
            HttpResponse<String> response,
            Long parkingLotId,
            int count,
            boolean liked
    ) {
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(JsonPath.<Number>read(response.body(), "$.parkingLotId").longValue()).isEqualTo(parkingLotId);
        assertThat(JsonPath.<Number>read(response.body(), "$.likeCount").longValue()).isEqualTo(count);
        assertThat(JsonPath.<Boolean>read(response.body(), "$.likedByMe")).isEqualTo(liked);
    }

    private long count(Long parkingLotId) {
        return jdbc.queryForObject(
                "select count(*) from parking_likes where parking_lot_id = ?",
                Long.class,
                parkingLotId
        );
    }

    private Long insertLot(boolean active) {
        String identity = UUID.randomUUID().toString();
        return jdbc.queryForObject(
                """
                insert into parking_lots (
                    source, source_external_id, name, address, active,
                    source_checked_at, created_at, updated_at
                ) values ('DATA_GO_KR', ?, ?, '좋아요 테스트 주소', ?,
                    current_timestamp, current_timestamp, current_timestamp)
                returning id
                """,
                Long.class,
                identity,
                "좋아요 테스트 " + identity,
                active
        );
    }
}
