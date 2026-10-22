package jumin.domain.admin.parking;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.jayway.jsonpath.JsonPath;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryPoolMXBean;
import java.lang.management.MemoryType;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import jumin.TestcontainersConfiguration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.util.unit.DataSize;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ParkingCsvImportIntegrationTest {

    private static final String CSV_HEADER = String.join(",",
            "parking_lots.id",
            "parking_lots.source",
            "parking_lots.source_external_id",
            "parking_lots.name",
            "parking_lots.sido",
            "parking_lots.sigungu",
            "parking_lots.address",
            "parking_lots.latitude",
            "parking_lots.longitude",
            "parking_lots.capacity",
            "parking_lots.mechanical",
            "parking_lots.is_public",
            "parking_lots.active",
            "parking_lots.source_checked_at",
            "parking_lots.created_at",
            "parking_lots.updated_at",
            "parking_operations.parking_lot_id",
            "parking_operations.base_free_minutes",
            "parking_operations.base_minutes",
            "parking_operations.base_fee",
            "parking_operations.additional_minutes",
            "parking_operations.additional_fee",
            "parking_operations.daily_max_fee",
            "parking_operations.monthly_fee",
            "parking_operations.weekday_paid",
            "parking_operations.saturday_paid",
            "parking_operations.holiday_paid",
            "parking_operations.weekday_status",
            "parking_operations.weekday_open_time",
            "parking_operations.weekday_close_time",
            "parking_operations.weekend_status",
            "parking_operations.weekend_open_time",
            "parking_operations.weekend_close_time",
            "parking_operations.holiday_status",
            "parking_operations.holiday_open_time",
            "parking_operations.holiday_close_time",
            "parking_operations.source_checked_at",
            "parking_operations.created_at",
            "parking_operations.updated_at");

    @LocalServerPort
    private int port;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private JwtEncoder jwtEncoder;

    @MockitoBean
    private Clock clock;

    @Value("${spring.servlet.multipart.max-file-size}")
    private String maxFileSize;

    private final HttpClient client = HttpClient.newHttpClient();
    private String token;

    @BeforeEach
    void setUp() {
        when(clock.instant()).thenAnswer(invocation -> Instant.now());
        jdbc.update("DELETE FROM parking_operations");
        jdbc.update("DELETE FROM parking_lots");
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("jumin-admin-test")
                .subject("admin")
                .issuedAt(now)
                .expiresAt(now.plusSeconds(300))
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        token = jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    @Test
    @DisplayName("업로드 후 추가, 수정, 누락 비활성화를 반영하고 같은 파일은 다시 저장하지 않는다")
    void importsUpdatesAndRepeatsWithoutTimestampChanges() throws Exception {
        // given
        HttpResponse<String> initial = upload("initial.csv", initialCsv());
        assertThat(initial.statusCode()).isEqualTo(200);
        assertCount(initial, "addedCount", 3);
        Map<String, Object> oldB = lot("B");
        Map<String, Object> oldBOperation = operation("B");
        Map<String, Object> oldCOperation = operation("C");

        // when
        HttpResponse<String> updated = upload("updated.csv", updatedCsv());

        // then
        assertThat(updated.statusCode()).isEqualTo(200);
        assertThat(updated.headers().firstValue("Cache-Control")).contains("no-store");
        assertCount(updated, "addedCount", 1);
        assertCount(updated, "updatedCount", 1);
        assertCount(updated, "deactivatedCount", 1);
        assertCount(updated, "reactivatedCount", 0);
        assertCount(updated, "unchangedCount", 1);
        assertThat(JsonPath.<Integer>read(updated.body(), "$.csvRowCount")).isEqualTo(3);
        assertThat(JsonPath.<String>read(updated.body(), "$.fileSha256")).hasSize(64);
        assertThat(lot("B")).isEqualTo(oldB);
        assertThat(operation("B").get("base_fee")).isEqualTo(2500);
        assertThat(operation("B").get("created_at")).isEqualTo(oldBOperation.get("created_at"));
        assertThat(lot("C").get("active")).isEqualTo(false);
        assertThat(operation("C")).isEqualTo(oldCOperation);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM parking_lots WHERE location IS NOT NULL", Integer.class))
                .isEqualTo(4);

        List<Map<String, Object>> beforeRepeat = snapshot();
        HttpResponse<String> repeated = upload("updated.csv", updatedCsv());
        assertThat(repeated.statusCode()).isEqualTo(200);
        assertCount(repeated, "addedCount", 0);
        assertCount(repeated, "updatedCount", 0);
        assertCount(repeated, "reactivatedCount", 0);
        assertCount(repeated, "deactivatedCount", 0);
        assertCount(repeated, "unchangedCount", 3);
        assertThat(snapshot()).isEqualTo(beforeRepeat);
    }

    @Test
    @DisplayName("이전 CSV가 다시 나타나면 비활성 주차장의 기존 ID로 재활성화한다")
    void reactivatesUsingExistingId() throws Exception {
        // given
        assertThat(upload("initial.csv", initialCsv()).statusCode()).isEqualTo(200);
        Object oldCId = lot("C").get("id");
        assertThat(upload("updated.csv", updatedCsv()).statusCode()).isEqualTo(200);

        // when
        HttpResponse<String> result = upload("initial.csv", initialCsv());

        // then
        assertThat(result.statusCode()).isEqualTo(200);
        assertCount(result, "addedCount", 0);
        assertCount(result, "reactivatedCount", 1);
        assertCount(result, "deactivatedCount", 1);
        assertThat(lot("C").get("id")).isEqualTo(oldCId);
        assertThat(lot("C").get("active")).isEqualTo(true);
        assertThat(lot("D").get("active")).isEqualTo(false);
    }

    @Test
    @DisplayName("CSV 중복 오류는 모든 중복 행을 알리고 기존 DB를 보존한다")
    void rejectsDuplicatesWithoutWriting() throws Exception {
        // given
        assertThat(upload("initial.csv", initialCsv()).statusCode()).isEqualTo(200);
        List<Map<String, Object>> before = snapshot();

        // when
        HttpResponse<String> result = upload("duplicate.csv", duplicateCsv());

        // then
        assertThat(result.statusCode()).isEqualTo(422);
        assertThat(JsonPath.<List<String>>read(result.body(), "$.errors[*].field"))
                .anyMatch(field -> field.startsWith("rows[2]."))
                .anyMatch(field -> field.startsWith("rows[3]."));
        assertThat(snapshot()).isEqualTo(before);
    }

    @Test
    @DisplayName("시간이 없는 OPEN도 상태를 바꾸지 않고 그대로 저장한다")
    void acceptsExistingScheduleSemantics() throws Exception {
        // given
        String csv = initialCsv().replace("OPEN,09:00,18:00:00", "OPEN,,18:00:00");

        // when
        HttpResponse<String> result = upload("schedule.csv", csv);

        // then
        assertThat(result.statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM parking_operations WHERE weekday_status = 'OPEN' "
                + "AND weekday_open_time IS NULL AND weekday_close_time = TIME '18:00'", Integer.class))
                .isEqualTo(3);
    }

    @Test
    @DisplayName("명시적 active=false 전환은 별도 확인 없이 모두 비활성화로 집계한다")
    void deactivatesAllWithoutConfirmation() throws Exception {
        // given
        assertThat(upload("initial.csv", initialCsv()).statusCode()).isEqualTo(200);
        String csv = initialCsv()
                .replace(",true,2026-09-28T18:42:55+09:00", ",false,2026-09-28T18:42:55+09:00");

        // when
        HttpResponse<String> result = upload("inactive.csv", csv);

        // then
        assertThat(result.statusCode()).isEqualTo(200);
        assertCount(result, "deactivatedCount", 3);
        assertCount(result, "updatedCount", 0);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM parking_lots WHERE active", Integer.class)).isZero();
    }

    @Test
    @DisplayName("합성 8922행 전체 업로드와 재업로드를 실제 HTTP, DB에서 검증한다")
    void importsFullSizedSyntheticDataset() throws Exception {
        // given
        List<String> lines = initialCsv().lines().toList();
        StringBuilder csv = new StringBuilder(lines.getFirst()).append('\n');
        for (int index = 0; index < 8_922; index++) {
            csv.append(lines.get(1)
                    .replace("CSV-DEMO-A", "CSV-SCALE-" + index)
                    .replace("CSV 샘플 A 주차장", "CSV 규모 테스트 " + index)
                    .replace("CSV샘플로 1", "CSV규모테스트로 " + index)).append('\n');
        }
        byte[] bytes = csv.toString().getBytes(StandardCharsets.UTF_8);
        List<MemoryPoolMXBean> heapPools = ManagementFactory.getMemoryPoolMXBeans().stream()
                .filter(pool -> pool.getType() == MemoryType.HEAP)
                .toList();
        heapPools.forEach(MemoryPoolMXBean::resetPeakUsage);

        // when
        long started = System.nanoTime();
        HttpResponse<String> imported = uploadBytes("scale.csv", bytes, token);
        long importMillis = (System.nanoTime() - started) / 1_000_000;
        started = System.nanoTime();
        HttpResponse<String> repeated = uploadBytes("scale.csv", bytes, token);
        long repeatMillis = (System.nanoTime() - started) / 1_000_000;

        // then
        assertThat(imported.statusCode()).isEqualTo(200);
        assertCount(imported, "addedCount", 8_922);
        assertThat(repeated.statusCode()).isEqualTo(200);
        assertCount(repeated, "unchangedCount", 8_922);
        assertCount(repeated, "addedCount", 0);
        assertCount(repeated, "updatedCount", 0);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM parking_lots", Integer.class)).isEqualTo(8_922);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM parking_operations", Integer.class)).isEqualTo(8_922);
        long heapPoolPeakBytes = heapPools.stream().mapToLong(pool -> pool.getPeakUsage().getUsed()).sum();
        System.out.printf("CSV_SCALE rows=8922 bytes=%d importMs=%d repeatMs=%d heapPoolPeaksBytes=%d%n",
                bytes.length, importMillis, repeatMillis, heapPoolPeakBytes);
    }

    @Test
    @DisplayName("관리자 인증 없이 업로드할 수 없다")
    void requiresAuthentication() throws Exception {
        // when
        HttpResponse<String> result = uploadBytes("initial.csv", initialCsv().getBytes(StandardCharsets.UTF_8), null);

        // then
        assertThat(result.statusCode()).isEqualTo(401);
        assertThat(JsonPath.<List<Object>>read(result.body(), "$.errors")).isEmpty();
        assertThat(snapshot()).isEmpty();
    }

    @Test
    @DisplayName("file part 누락은 공통 400 오류를 반환한다")
    void rejectsMissingFile() throws Exception {
        // given
        HttpRequest request = request()
                .header("Content-Type", "multipart/form-data; boundary=missing")
                .header("Authorization", "Bearer " + token)
                .POST(HttpRequest.BodyPublishers.ofString("--missing--\r\n"))
                .build();

        // when
        HttpResponse<String> result = client.send(request, HttpResponse.BodyHandlers.ofString());

        // then
        assertThat(result.statusCode()).isEqualTo(400);
        assertThat(JsonPath.<List<Object>>read(result.body(), "$.errors")).isEmpty();
    }

    @Test
    @DisplayName("실제 multipart 파일 한도 초과는 공통 413 오류를 반환한다")
    void rejectsOversizeAtServletBoundary() throws Exception {
        // given
        byte[] content = new byte[Math.toIntExact(DataSize.parse(maxFileSize).toBytes()) + 1];

        // when
        HttpResponse<String> result = uploadBytes("oversize.csv", content, token);

        // then
        assertThat(result.statusCode()).isEqualTo(413);
        assertThat(JsonPath.<String>read(result.body(), "$.message"))
                .isEqualTo("업로드 파일 또는 요청 크기가 허용 한도를 초과했습니다.");
        assertThat(JsonPath.<List<Object>>read(result.body(), "$.errors")).isEmpty();
        assertThat(snapshot()).isEmpty();
    }

    @Test
    @DisplayName("CSV 외 확장자와 잘못된 UTF-8은 415 오류를 반환한다")
    void rejectsUnsupportedFiles() throws Exception {
        // when
        HttpResponse<String> extension = upload("initial.txt", initialCsv());
        HttpResponse<String> encoding = uploadBytes("invalid.csv", new byte[] {(byte) 0xC3, 0x28}, token);

        // then
        assertThat(extension.statusCode()).isEqualTo(415);
        assertThat(encoding.statusCode()).isEqualTo(415);
        assertThat(snapshot()).isEmpty();
    }

    @ParameterizedTest
    @CsvSource({
            "2026-10-13T03:00:00Z, WEEKDAY",
            "2026-10-17T03:00:00Z, SATURDAY",
            "2026-10-18T03:00:00Z, SUNDAY"
    })
    @DisplayName("CSV의 오늘 무료와 기계식 정보로 지도 목록을 필터링하고 숫자형 LOD 점수를 반환한다")
    void filters_imported_parking_lots_and_returns_lod_scores(String instant, String expectedLot) throws Exception {
        // given
        when(clock.instant()).thenReturn(Instant.parse(instant));
        String data = csv(
                csvRow("FREE-N", 1, 0, "N", "false", "false", "false"),
                csvRow("FREE-Y", 2, 0, "Y", "false", "false", "false"),
                csvRow("FREE-BLANK", 3, 0, "", "false", "false", "false"),
                csvRow("PAID-N", 4, 1000, "N", "true", "true", "true"),
                csvRow("WEEKDAY", 5, 1000, "N", "false", "true", "true"),
                csvRow("SATURDAY", 6, 1000, "N", "true", "false", "true"),
                csvRow("SUNDAY", 7, 1000, "N", "true", "true", "false"),
                csvRow("UNKNOWN", 8, 0, "N", "", "", "")
        );
        assertThat(upload("filters.csv", data).statusCode()).isEqualTo(200);
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port
                        + "/api/parking/viewport?westLongitude=126.97&southLatitude=37.56"
                        + "&eastLongitude=126.99&northLatitude=37.58&freeOnly=true&excludeMechanical=true"))
                .GET()
                .build();

        // when
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        // then
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(lot("FREE-BLANK").get("mechanical")).isEqualTo(false);
        assertThat(JsonPath.<Integer>read(response.body(), "$.totalCount")).isEqualTo(3);
        assertThat(JsonPath.<List<Integer>>read(response.body(), "$.parkingLots[*].id")).containsExactly(
                ((Number) lot("FREE-N").get("id")).intValue(),
                ((Number) lot("FREE-BLANK").get("id")).intValue(),
                ((Number) lot(expectedLot).get("id")).intValue()
        );
        assertThat(JsonPath.<List<Number>>read(response.body(), "$.parkingLots[*].score"))
                .hasSize(3)
                .allSatisfy(score -> assertThat(score.doubleValue()).isEqualTo(0.16666666666666666));
    }

    @Test
    @DisplayName("공영 여부를 업로드하고 세 지도 필터 조합과 변경 및 재업로드를 반영한다")
    void imports_is_public_and_filters_updated_classification() throws Exception {
        // given
        String initial = csv(
                csvRow("PUBLIC", 1, 0, "N", "true", "false", "false", "false"),
                csvRow("MECHANICAL", 2, 0, "Y", "true", "false", "false", "false"),
                csvRow("PAID", 3, 1000, "N", "true", "true", "true", "true"),
                csvRow("PRIVATE", 4, 0, "N", "false", "false", "false", "false"),
                csvRow("UNKNOWN", 5, 0, "N", "", "false", "false", "false")
        );
        assertThat(upload("public-initial.csv", initial).statusCode()).isEqualTo(200);
        Map<String, Object> initialPublic = lot("PUBLIC");
        Map<String, Object> initialPrivate = lot("PRIVATE");
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port
                        + "/api/parking/viewport?westLongitude=126.97&southLatitude=37.56"
                        + "&eastLongitude=126.99&northLatitude=37.58"
                        + "&isPublic=true&freeOnly=true&excludeMechanical=true"))
                .GET()
                .build();

        // when
        HttpResponse<String> initialResult = client.send(request, HttpResponse.BodyHandlers.ofString());

        // then
        assertThat(initialResult.statusCode()).isEqualTo(200);
        assertThat(JsonPath.<Integer>read(initialResult.body(), "$.totalCount")).isEqualTo(1);
        assertThat(JsonPath.<List<Integer>>read(initialResult.body(), "$.parkingLots[*].id"))
                .containsExactly(((Number) initialPublic.get("id")).intValue());
        assertThat(lot("UNKNOWN").get("is_public")).isNull();

        // given
        String updated = csv(
                csvRow("PUBLIC", 1, 0, "N", "false", "false", "false", "false"),
                csvRow("MECHANICAL", 2, 0, "Y", "true", "false", "false", "false"),
                csvRow("PAID", 3, 1000, "N", "true", "true", "true", "true"),
                csvRow("PRIVATE", 4, 0, "N", "true", "false", "false", "false"),
                csvRow("UNKNOWN", 5, 0, "N", "", "false", "false", "false")
        );

        // when
        HttpResponse<String> updateResponse = upload("public-updated.csv", updated);
        HttpResponse<String> updatedResult = client.send(request, HttpResponse.BodyHandlers.ofString());

        // then
        assertThat(updateResponse.statusCode()).isEqualTo(200);
        assertCount(updateResponse, "updatedCount", 2);
        assertCount(updateResponse, "unchangedCount", 3);
        assertThat(lot("PUBLIC").get("is_public")).isEqualTo(false);
        assertThat(lot("PUBLIC").get("id")).isEqualTo(initialPublic.get("id"));
        assertThat(lot("PRIVATE").get("id")).isEqualTo(initialPrivate.get("id"));
        assertThat(updatedResult.statusCode()).isEqualTo(200);
        assertThat(JsonPath.<Integer>read(updatedResult.body(), "$.totalCount")).isEqualTo(1);
        assertThat(JsonPath.<List<Integer>>read(updatedResult.body(), "$.parkingLots[*].id"))
                .containsExactly(((Number) initialPrivate.get("id")).intValue());

        // given
        Map<String, Object> updatedPrivate = lot("PRIVATE");

        // when
        HttpResponse<String> repeated = upload("public-updated.csv", updated);

        // then
        assertThat(repeated.statusCode()).isEqualTo(200);
        assertCount(repeated, "updatedCount", 0);
        assertCount(repeated, "unchangedCount", 5);
        assertThat(lot("PRIVATE")).isEqualTo(updatedPrivate);

        // given
        assertThat(upload("unknown.csv", csv(
                csvRow("UNKNOWN", 5, 0, "N", "", "false", "false", "false")
        )).statusCode()).isEqualTo(200);

        // when
        HttpResponse<String> emptyResult = client.send(request, HttpResponse.BodyHandlers.ofString());

        // then
        assertThat(emptyResult.statusCode()).isEqualTo(200);
        assertThat(JsonPath.<Integer>read(emptyResult.body(), "$.totalCount")).isZero();
        assertThat(JsonPath.<List<Object>>read(emptyResult.body(), "$.parkingLots")).isEmpty();
    }

    private String initialCsv() {
        return csv(csvRow("A", 1, 1000), csvRow("B", 2, 2000), csvRow("C", 3, 3000));
    }

    private String updatedCsv() {
        return csv(csvRow("A", 1, 1000), csvRow("B", 2, 2500), csvRow("D", 4, 4000));
    }

    private String duplicateCsv() {
        return csv(csvRow("A", 1, 1000), csvRow("A", 1, 2000));
    }

    private String csv(String... rows) {
        return "\uFEFF" + CSV_HEADER + "\r\n" + String.join("\r\n", rows) + "\r\n";
    }

    private String csvRow(String label, int addressNumber, int baseFee) {
        return csvRow(label, addressNumber, baseFee, "N", "true", "", "");
    }

    private String csvRow(
            String label, int addressNumber, int baseFee,
            String mechanical, String weekdayPaid, String saturdayPaid, String holidayPaid
    ) {
        return csvRow(label, addressNumber, baseFee, mechanical, "", weekdayPaid, saturdayPaid, holidayPaid);
    }

    private String csvRow(
            String label, int addressNumber, int baseFee,
            String mechanical, String isPublic, String weekdayPaid, String saturdayPaid, String holidayPaid
    ) {
        return ("ignored-csv-id,DATA_GO_KR,CSV-DEMO-%s,CSV 샘플 %s 주차장,"
                + "서울특별시,중구,서울특별시 중구 CSV샘플로 %d,37.5665,126.9780,10,%s,%s,true,"
                + "2026-09-28T18:42:55+09:00,,,ignored-csv-fk,,30,%d,,,,,%s,%s,%s,"
                + "OPEN,09:00,18:00:00,,,,,,,2026-09-28T09:42:55Z,,")
                .formatted(label, label, addressNumber, mechanical, isPublic, baseFee,
                        weekdayPaid, saturdayPaid, holidayPaid);
    }

    private HttpResponse<String> upload(String name, String csv) throws Exception {
        return uploadBytes(name, csv.getBytes(StandardCharsets.UTF_8), token);
    }

    private HttpResponse<String> uploadBytes(String name, byte[] bytes, String accessToken) throws Exception {
        String boundary = "parking-csv-integration-boundary";
        String prefix = "--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"file\"; filename=\"" + name + "\"\r\n"
                + "Content-Type: text/csv\r\n\r\n";
        HttpRequest.Builder builder = request()
                .header("Content-Type", "multipart/form-data; boundary=" + boundary);
        if (accessToken != null) {
            builder.header("Authorization", "Bearer " + accessToken);
        }
        HttpRequest request = builder.POST(HttpRequest.BodyPublishers.concat(
                HttpRequest.BodyPublishers.ofString(prefix),
                HttpRequest.BodyPublishers.ofByteArray(bytes),
                HttpRequest.BodyPublishers.ofString("\r\n--" + boundary + "--\r\n")
        )).build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private HttpRequest.Builder request() {
        return HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/admin/parking/csv/import"));
    }

    private void assertCount(HttpResponse<String> response, String field, int expected) {
        assertThat(JsonPath.<Integer>read(response.body(), "$.summary." + field)).isEqualTo(expected);
    }

    private Map<String, Object> lot(String label) {
        return jdbc.queryForMap("SELECT id, active, mechanical, is_public, created_at, updated_at FROM parking_lots "
                + "WHERE source_external_id = ?", "CSV-DEMO-" + label);
    }

    private Map<String, Object> operation(String label) {
        return jdbc.queryForMap("SELECT o.* FROM parking_operations o JOIN parking_lots p ON p.id = o.parking_lot_id "
                + "WHERE p.source_external_id = ?", "CSV-DEMO-" + label);
    }

    private List<Map<String, Object>> snapshot() {
        return jdbc.queryForList("SELECT p.id, p.name, p.active, p.created_at, p.updated_at, "
                + "o.base_fee, o.created_at AS operation_created_at, o.updated_at AS operation_updated_at "
                + "FROM parking_lots p LEFT JOIN parking_operations o ON p.id = o.parking_lot_id ORDER BY p.id");
    }
}
