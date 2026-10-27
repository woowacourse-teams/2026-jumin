package jumin.domain.admin.parking;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import jumin.TestcontainersConfiguration;
import jumin.domain.admin.parking.csv.ParkingCsvColumn;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
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

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.hikari.maximum-pool-size=1",
        "spring.datasource.hikari.minimum-idle=1"
})
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ParkingCsvStreamingImportIntegrationTest {

    private static final int ROW_COUNT = 1200;
    private static final int LATE_ROW_INDEX = 1100;

    @LocalServerPort
    private int port;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private JwtEncoder jwtEncoder;

    private final HttpClient client = HttpClient.newHttpClient();
    private String token;
    private int backendId;

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM parking_operations");
        jdbc.update("DELETE FROM parking_lots");
        backendId = jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class);
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("jumin-admin-test")
                .subject("admin")
                .issuedAt(now)
                .expiresAt(now.plusSeconds(300))
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        token = jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
        assertStagingTablesRemoved();
    }

    @Test
    @DisplayName("1102번째 행의 필드 오류는 기존 DB를 보존하고 임시 데이터를 정리해 다음 업로드가 성공한다")
    void rejects_late_invalid_value_and_accepts_following_valid_upload() throws Exception {
        // given
        assertThat(upload(rows(1000)).statusCode()).isEqualTo(200);
        DatabaseState before = databaseState();
        List<String[]> invalidRows = rows(2000);
        invalidRows.get(LATE_ROW_INDEX)[ParkingCsvColumn.BASE_FEE.ordinal()] = "invalid";

        // when
        HttpResponse<String> rejected = upload(invalidRows);

        // then
        assertThat(rejected.statusCode()).isEqualTo(422);
        assertThat(errorFields(rejected)).containsExactly("rows[1102].parking_operations.base_fee");
        assertThat(databaseState()).isEqualTo(before);
        assertStagingTablesRemoved();

        // when
        HttpResponse<String> accepted = upload(rows(2000));

        // then
        assertThat(accepted.statusCode()).isEqualTo(200);
        assertThat(JsonPath.<Integer>read(accepted.body(), "$.summary.updatedCount")).isEqualTo(ROW_COUNT);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM parking_operations WHERE base_fee = 2000", Integer.class))
                .isEqualTo(ROW_COUNT);
        assertStagingTablesRemoved();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    @DisplayName("배치를 넘는 중복은 필드가 잘못되거나 NUL이 들어간 키도 모든 행 번호를 반환한다")
    void reports_cross_batch_duplicate_keys_including_invalid_rows(boolean nulKey) throws Exception {
        // given
        assertThat(upload(rows(1000)).statusCode()).isEqualTo(200);
        DatabaseState before = databaseState();
        List<String[]> duplicateRows = rows(2000);
        String duplicateName = "stream-parking-7";
        if (nulKey) {
            duplicateName = "stream-parking-7\0";
        }
        duplicateRows.get(7)[ParkingCsvColumn.NAME.ordinal()] = duplicateName;
        duplicateRows.get(LATE_ROW_INDEX)[ParkingCsvColumn.NAME.ordinal()] = duplicateName;
        duplicateRows.get(LATE_ROW_INDEX)[ParkingCsvColumn.ADDRESS.ordinal()] = "서울특별시 중구 테스트로 7";
        duplicateRows.get(LATE_ROW_INDEX)[ParkingCsvColumn.BASE_FEE.ordinal()] = "invalid";

        // when
        HttpResponse<String> rejected = upload(duplicateRows);

        // then
        assertThat(rejected.statusCode()).isEqualTo(422);
        List<Map<String, String>> errors = JsonPath.read(rejected.body(), "$.errors");
        assertThat(errors.stream()
                .filter(error -> error.get("message").contains("중복"))
                .map(error -> error.get("field")))
                .containsExactly("rows[9].parking_lots.name", "rows[1102].parking_lots.name");
        assertThat(errorFields(rejected)).contains("rows[1102].parking_operations.base_fee");
        if (nulKey) {
            assertThat(errors.stream().filter(error -> error.get("message").contains("NUL")))
                    .hasSize(2);
        }
        assertThat(databaseState()).isEqualTo(before);
        assertStagingTablesRemoved();
    }

    @Test
    @DisplayName("여러 배치 뒤의 UTF-8 오류를 앞선 필드 오류보다 우선하고 기존 DB와 임시 데이터 정리를 보장한다")
    void prioritizes_late_encoding_error_after_staging_valid_batches() throws Exception {
        // given
        assertThat(upload(rows(1000)).statusCode()).isEqualTo(200);
        DatabaseState before = databaseState();
        List<String[]> invalidRows = rows(2000);
        invalidRows.get(7)[ParkingCsvColumn.BASE_FEE.ordinal()] = "invalid";
        byte[] validUtf8 = csv(invalidRows).getBytes(StandardCharsets.UTF_8);
        byte[] invalidUtf8 = Arrays.copyOf(validUtf8, validUtf8.length + 2);
        invalidUtf8[validUtf8.length] = (byte) 0xC3;
        invalidUtf8[validUtf8.length + 1] = 0x28;

        // when
        HttpResponse<String> rejected = uploadBytes(invalidUtf8);

        // then
        assertThat(rejected.statusCode()).isEqualTo(415);
        assertThat(JsonPath.<String>read(rejected.body(), "$.message"))
                .isEqualTo("UTF-8 또는 UTF-8 BOM 인코딩만 지원합니다.");
        assertThat(databaseState()).isEqualTo(before);
        assertStagingTablesRemoved();
    }

    @Test
    @DisplayName("실제 DB의 세 번째 배치 저장 실패는 이미 실행한 천 건 이상의 수정까지 롤백한다")
    void rolls_back_real_table_updates_when_later_batch_fails_and_can_retry() throws Exception {
        // given
        assertThat(upload(rows(1000)).statusCode()).isEqualTo(200);
        DatabaseState before = databaseState();
        try {
            installUpdateFailureTrigger("NEW.source_external_id = 'STREAM-1100' AND NEW.capacity = 20");

            // when
            HttpResponse<String> rejected = upload(rows(2000));

            // then
            assertThat(rejected.statusCode()).isEqualTo(500);
            // 시퀀스 증가는 롤백되지 않아 앞선 배치가 실제 테이블을 수정했는지 확인할 수 있다.
            assertThat(jdbc.queryForObject("SELECT last_value FROM csv_streaming_test_updates", Long.class))
                    .isGreaterThan(1000L);
            assertThat(databaseState()).isEqualTo(before);
            assertStagingTablesRemoved();
        } finally {
            removeUpdateFailureTrigger();
        }

        // when
        HttpResponse<String> accepted = upload(rows(2000));

        // then
        assertThat(accepted.statusCode()).isEqualTo(200);
        assertThat(JsonPath.<Integer>read(accepted.body(), "$.summary.updatedCount")).isEqualTo(ROW_COUNT);
        assertStagingTablesRemoved();
    }

    @Test
    @DisplayName("누락 비활성화 후반의 실패는 기존 수정을 함께 롤백하고 재시도하면 NULL 주소 행도 비활성화한다")
    void rolls_back_late_missing_row_failure_and_deactivates_legacy_null_address_on_retry() throws Exception {
        // given
        assertThat(upload(rows(1000)).statusCode()).isEqualTo(200);
        jdbc.update("UPDATE parking_lots SET address = NULL WHERE source_external_id = 'STREAM-42'");
        DatabaseState before = databaseState();
        List<String[]> uploadedRows = rows(2000).subList(ROW_COUNT - 1, ROW_COUNT);
        try {
            installUpdateFailureTrigger("NEW.source_external_id = 'STREAM-1100' AND NOT NEW.active");

            // when
            HttpResponse<String> rejected = upload(uploadedRows);

            // then
            assertThat(rejected.statusCode()).isEqualTo(500);
            assertThat(jdbc.queryForObject("SELECT last_value FROM csv_streaming_test_updates", Long.class))
                    .isGreaterThan(1000L);
            assertThat(databaseState()).isEqualTo(before);
            assertStagingTablesRemoved();
        } finally {
            removeUpdateFailureTrigger();
        }

        // when
        HttpResponse<String> accepted = upload(uploadedRows);

        // then
        assertThat(accepted.statusCode()).isEqualTo(200);
        assertThat(JsonPath.<Integer>read(accepted.body(), "$.summary.updatedCount")).isEqualTo(1);
        assertThat(JsonPath.<Integer>read(accepted.body(), "$.summary.deactivatedCount")).isEqualTo(ROW_COUNT - 1);
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM parking_lots
                WHERE source_external_id = 'STREAM-42' AND address IS NULL AND NOT active
                """, Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM parking_lots WHERE active", Integer.class)).isEqualTo(1);
        assertStagingTablesRemoved();
    }

    private void installUpdateFailureTrigger(String condition) {
        jdbc.execute("CREATE SEQUENCE csv_streaming_test_updates");
        jdbc.execute("""
                CREATE FUNCTION csv_streaming_test_reject_update() RETURNS trigger AS $$
                BEGIN
                    PERFORM nextval('csv_streaming_test_updates');
                    IF %s THEN
                        RAISE EXCEPTION 'CSV streaming rollback test' USING ERRCODE = '23514';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql
                """.formatted(condition));
        jdbc.execute("""
                CREATE TRIGGER csv_streaming_test_reject_update
                BEFORE UPDATE ON parking_lots
                FOR EACH ROW EXECUTE FUNCTION csv_streaming_test_reject_update()
                """);
    }

    private void removeUpdateFailureTrigger() {
        jdbc.execute("DROP TRIGGER IF EXISTS csv_streaming_test_reject_update ON parking_lots");
        jdbc.execute("DROP FUNCTION IF EXISTS csv_streaming_test_reject_update()");
        jdbc.execute("DROP SEQUENCE IF EXISTS csv_streaming_test_updates");
    }

    private List<String[]> rows(int fee) {
        List<String[]> rows = new ArrayList<>(ROW_COUNT);
        for (int index = 0; index < ROW_COUNT; index++) {
            String[] row = new String[ParkingCsvColumn.values().length];
            Arrays.fill(row, "");
            row[ParkingCsvColumn.SOURCE.ordinal()] = "DATA_GO_KR";
            row[ParkingCsvColumn.SOURCE_EXTERNAL_ID.ordinal()] = "STREAM-" + index;
            row[ParkingCsvColumn.NAME.ordinal()] = "stream-parking-" + index;
            row[ParkingCsvColumn.ADDRESS.ordinal()] = "서울특별시 중구 테스트로 " + index;
            row[ParkingCsvColumn.LATITUDE.ordinal()] = "37.5665";
            row[ParkingCsvColumn.LONGITUDE.ordinal()] = "126.9780";
            row[ParkingCsvColumn.CAPACITY.ordinal()] = Integer.toString(fee / 100);
            row[ParkingCsvColumn.MECHANICAL.ordinal()] = "N";
            row[ParkingCsvColumn.ACTIVE.ordinal()] = "true";
            row[ParkingCsvColumn.LOT_SOURCE_CHECKED_AT.ordinal()] = "2026-10-22T00:00:00Z";
            row[ParkingCsvColumn.OPERATION_SOURCE_CHECKED_AT.ordinal()] = "2026-10-22T00:00:00Z";
            row[ParkingCsvColumn.BASE_FEE.ordinal()] = Integer.toString(fee);
            rows.add(row);
        }
        return rows;
    }

    private String csv(List<String[]> rows) {
        StringBuilder csv = new StringBuilder(String.join(",", ParkingCsvColumn.headers())).append('\n');
        for (String[] row : rows) {
            csv.append(String.join(",", row)).append('\n');
        }
        return csv.toString();
    }

    private HttpResponse<String> upload(List<String[]> rows) throws Exception {
        return uploadBytes(csv(rows).getBytes(StandardCharsets.UTF_8));
    }

    private HttpResponse<String> uploadBytes(byte[] bytes) throws Exception {
        String boundary = "parking-csv-streaming-test-boundary";
        String prefix = "--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"file\"; filename=\"streaming.csv\"\r\n"
                + "Content-Type: text/csv\r\n\r\n";
        HttpRequest request = HttpRequest.newBuilder(URI.create(
                        "http://localhost:" + port + "/api/admin/parking/csv/import"))
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .header("Authorization", "Bearer " + token)
                .POST(HttpRequest.BodyPublishers.concat(
                        HttpRequest.BodyPublishers.ofString(prefix),
                        HttpRequest.BodyPublishers.ofByteArray(bytes),
                        HttpRequest.BodyPublishers.ofString("\r\n--" + boundary + "--\r\n")))
                .build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private List<String> errorFields(HttpResponse<String> response) {
        return JsonPath.read(response.body(), "$.errors[*].field");
    }

    private DatabaseState databaseState() {
        return new DatabaseState(
                jdbc.queryForList("SELECT to_jsonb(l)::text FROM parking_lots l ORDER BY id", String.class),
                jdbc.queryForList("SELECT to_jsonb(o)::text FROM parking_operations o ORDER BY parking_lot_id",
                        String.class)
        );
    }

    private void assertStagingTablesRemoved() {
        assertThat(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class)).isEqualTo(backendId);
        assertThat(jdbc.queryForObject("""
                SELECT count(*) FROM pg_class
                WHERE relnamespace = pg_my_temp_schema() AND relkind IN ('r', 'p')
                """, Integer.class)).isZero();
    }

    private record DatabaseState(List<String> lots, List<String> operations) {
    }
}
