package jumin.domain.admin.parking.service;

import static jumin.domain.admin.parking.repository.ParkingCsvDatabaseTestSupport.findAll;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;
import jumin.TestcontainersConfiguration;
import jumin.domain.admin.parking.csv.ParkingCsvColumn;
import jumin.domain.admin.parking.dto.ParkingCsvSummaryResponse;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.domain.admin.parking.model.ParkingDbRow;
import jumin.domain.admin.parking.model.ParkingLotValues;
import jumin.domain.admin.parking.model.ParkingOperationValues;
import jumin.domain.admin.parking.model.ParkingScheduleValues;
import jumin.domain.parking.entity.ParkingDataSource;
import jumin.domain.parking.entity.ParkingOperationStatus;
import jumin.domain.parking.viewport.ViewportSquareGrid;
import jumin.domain.parking.viewport.ViewportMappingState;
import jumin.domain.parking.viewport.ViewportMappingStateRepository;
import jumin.domain.parking.viewport.ViewportWriteCoordinator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class ParkingCsvSyncServiceIntegrationTest {

    private static final Instant FIRST_UPLOAD_AT = Instant.parse("2026-10-22T01:00:00Z");
    private static final Instant NEXT_UPLOAD_AT = FIRST_UPLOAD_AT.plusSeconds(3600);
    private static final int EXISTING_COUNT = 1200;
    private static final int ADDED_COUNT = 501;

    @Autowired
    private ParkingCsvImportService importService;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ViewportWriteCoordinator viewportWriter;

    @Autowired
    private ViewportMappingStateRepository viewportVersions;

    @Autowired
    private ViewportSquareGrid viewportGrid;

    @MockitoBean
    private Clock clock;

    @BeforeEach
    @AfterEach
    void clearParkingData() {
        jdbc.update("UPDATE parking_viewport_cache_state SET projection_ready = FALSE WHERE id = 1");
        jdbc.update("DELETE FROM parking_operations");
        jdbc.update("DELETE FROM parking_lots");
        jdbc.update("DELETE FROM walking_edges");
        jdbc.update("DELETE FROM walking_nodes");
        jdbc.update("DELETE FROM walking_network_metadata");
    }

    @Test
    @DisplayName("CSV 동기화는 준비된 캐시의 좌표 매핑을 같은 트랜잭션에서 갱신한다")
    void syncs_csv_with_prepared_viewport_mapping_and_version() {
        // given
        ParkingCsvRow original = row(1, 1, true);
        ParkingCsvRow changed = row(1, 2, true);
        sync(List.of(original), FIRST_UPLOAD_AT);
        ViewportMappingState before = viewportWriter.prepare();
        assertThat(before.ready()).isTrue();

        // when
        ParkingCsvSummaryResponse summary = sync(List.of(changed), NEXT_UPLOAD_AT);
        ViewportMappingState after = viewportVersions.read();

        // then
        assertSummary(summary, 0, 1, 0, 0, 0);


        assertThat(after.ready()).isTrue();
        assertThat(jdbc.queryForObject("SELECT viewport_grid_cell FROM parking_lots WHERE name = ?", Long.class,
                changed.lot().name())).isEqualTo(viewportGrid.cellId(
                        changed.lot().latitude(), changed.lot().longitude(), 1000));
        assertSummary(sync(List.of(changed), NEXT_UPLOAD_AT), 0, 0, 0, 0, 1);
        assertThat(viewportVersions.read()).isEqualTo(after);
    }

    @Test
    @DisplayName("여러 DB 배치의 변경과 501건 추가를 정확히 집계하고 모든 값과 ID, 시각을 보존한다")
    void synchronizes_mixed_changes_across_pages_and_skips_identical_reupload() {
        // given
        List<ParkingCsvRow> initial = new ArrayList<>();
        List<ParkingCsvRow> uploaded = new ArrayList<>();
        Map<String, ParkingCsvRow> expected = new HashMap<>();
        for (int index = 0; index < EXISTING_COUNT; index++) {
            int kind = index % 6;
            boolean initiallyActive = kind != 2 && kind != 5;
            ParkingCsvRow before = row(index, 1, initiallyActive);
            initial.add(before);
            expected.put(before.lot().name(), before);
            if (kind == 0) {
                addExpected(uploaded, expected, row(index, 2, true));
            }
            if (kind == 1 || kind == 2) {
                addExpected(uploaded, expected, row(index, 1, true));
            }
            if (kind == 3) {
                addExpected(uploaded, expected, row(index, 1, false));
            }
            if (kind == 4) {
                expected.put(before.lot().name(), row(index, 1, false));
            }
        }
        sync(initial, FIRST_UPLOAD_AT);
        Map<String, ParkingDbRow> original = byName(findAll(jdbc));
        long missingOperationId = original.get(name(1)).id();
        jdbc.update("DELETE FROM parking_operations WHERE parking_lot_id = ?", missingOperationId);
        for (int index = EXISTING_COUNT; index < EXISTING_COUNT + ADDED_COUNT; index++) {
            addExpected(uploaded, expected, row(index, 2, true));
        }
        Collections.reverse(uploaded);

        // when
        ParkingCsvSummaryResponse summary = sync(uploaded, NEXT_UPLOAD_AT);

        // then
        assertSummary(summary, ADDED_COUNT, 201, 200, 400, 199);
        Map<String, ParkingDbRow> saved = byName(findAll(jdbc));
        Map<Long, RowAudit> audits = audits();
        assertThat(saved).hasSize(EXISTING_COUNT + ADDED_COUNT);
        assertThat(audits).hasSize(EXISTING_COUNT + ADDED_COUNT);
        for (Map.Entry<String, ParkingCsvRow> entry : expected.entrySet()) {
            ParkingDbRow actual = saved.get(entry.getKey());
            assertThat(actual.lot()).as(entry.getKey()).isEqualTo(entry.getValue().lot());
            assertThat(actual.operation()).as(entry.getKey()).isEqualTo(entry.getValue().operation());
        }
        for (int index = 0; index < EXISTING_COUNT; index++) {
            ParkingDbRow actual = saved.get(name(index));
            assertThat(actual.id()).as(name(index)).isEqualTo(original.get(name(index)).id());
            int kind = index % 6;
            Instant lotUpdatedAt = NEXT_UPLOAD_AT;
            if (kind == 1 || kind == 5) {
                lotUpdatedAt = FIRST_UPLOAD_AT;
            }
            Instant operationCreatedAt = FIRST_UPLOAD_AT;
            Instant operationUpdatedAt = FIRST_UPLOAD_AT;
            if (kind == 0 || index == 1) {
                operationUpdatedAt = NEXT_UPLOAD_AT;
            }
            if (index == 1) {
                operationCreatedAt = NEXT_UPLOAD_AT;
            }
            assertThat(audits.get(actual.id())).as(name(index)).isEqualTo(new RowAudit(
                    FIRST_UPLOAD_AT, lotUpdatedAt, operationCreatedAt, operationUpdatedAt
            ));
        }
        for (int index = EXISTING_COUNT; index < EXISTING_COUNT + ADDED_COUNT; index++) {
            assertThat(audits.get(saved.get(name(index)).id())).isEqualTo(new RowAudit(
                    NEXT_UPLOAD_AT, NEXT_UPLOAD_AT, NEXT_UPLOAD_AT, NEXT_UPLOAD_AT
            ));
        }
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM parking_lots
                WHERE ST_X(location::geometry) IS DISTINCT FROM longitude
                   OR ST_Y(location::geometry) IS DISTINCT FROM latitude
                """, Integer.class)).isZero();

        // given
        DatabaseState beforeRepeat = databaseState();

        // when
        ParkingCsvSummaryResponse repeated = sync(uploaded, NEXT_UPLOAD_AT.plusSeconds(3600));

        // then
        assertSummary(repeated, 0, 0, 0, 0, uploaded.size());
        assertThat(databaseState()).isEqualTo(beforeRepeat);
    }

    @Test
    @DisplayName("기존 문자열의 일반 공백만 정규화하여 비교하고 동일 입력은 원문과 수정 시각을 보존한다")
    void preserves_raw_legacy_text_when_normalized_values_are_unchanged() {
        // given
        ParkingCsvRow base = row(0, 1, true);
        ParkingLotValues old = base.lot();
        ParkingLotValues normalized = new ParkingLotValues(
                old.source(), old.sourceExternalId(), old.name(), null, "\t중구\t", old.address(),
                old.latitude(), old.longitude(), old.capacity(), old.mechanical(), old.isPublic(), old.active(), old.sourceCheckedAt()
        );
        ParkingCsvRow uploaded = new ParkingCsvRow(base.rowNumber(), normalized, base.operation());
        sync(List.of(uploaded), FIRST_UPLOAD_AT);
        long id = findAll(jdbc).getFirst().id();
        jdbc.update("""
                UPDATE parking_lots
                SET source = ' DATA_GO_KR ', source_external_id = ' source-0-1 ',
                    name = ?, sido = '   ', sigungu = ?, address = ' 주소-0 '
                WHERE id = ?
                """, " " + old.name() + " ", " \t중구\t ", id);
        DatabaseState before = databaseState();

        // when
        ParkingCsvSummaryResponse unchanged = sync(List.of(uploaded), NEXT_UPLOAD_AT);

        // then
        assertSummary(unchanged, 0, 0, 0, 0, 1);
        assertThat(databaseState()).isEqualTo(before);
        assertThat(findAll(jdbc).getFirst()).isEqualTo(new ParkingDbRow(id, normalized, base.operation()));

        // given
        ParkingLotValues withoutTabs = new ParkingLotValues(
                old.source(), old.sourceExternalId(), old.name(), null, "중구", old.address(),
                old.latitude(), old.longitude(), old.capacity(), old.mechanical(), old.isPublic(), old.active(), old.sourceCheckedAt()
        );
        ParkingCsvRow changed = new ParkingCsvRow(base.rowNumber(), withoutTabs, base.operation());

        // when
        ParkingCsvSummaryResponse updated = sync(List.of(changed), NEXT_UPLOAD_AT);

        // then
        assertSummary(updated, 0, 1, 0, 0, 0);
        assertThat(findAll(jdbc).getFirst()).isEqualTo(new ParkingDbRow(id, withoutTabs, base.operation()));
        assertThat(audits().get(id)).isEqualTo(new RowAudit(
                FIRST_UPLOAD_AT, NEXT_UPLOAD_AT, FIRST_UPLOAD_AT, FIRST_UPLOAD_AT
        ));
    }

    @Test
    @DisplayName("null과 부분 운영시간, 확인 시각의 소수초를 보존하고 변경된 테이블의 수정 시각만 갱신한다")
    void distinguishes_lot_and_operation_changes_with_nullable_and_fractional_values() {
        // given
        ParkingCsvRow lotOnly = row(0, 1, true);
        ParkingCsvRow operationOnly = row(1, 1, true);
        ParkingCsvRow unchangedBase = row(2, 1, true);
        ParkingOperationValues partial = new ParkingOperationValues(
                null, 13, null, 29, null, 47000, null, null, false, null,
                new ParkingScheduleValues(ParkingOperationStatus.OPEN, null, LocalTime.of(18, 2, 3)),
                new ParkingScheduleValues(null, LocalTime.of(8, 4, 5), null),
                new ParkingScheduleValues(ParkingOperationStatus.UNKNOWN, null, null),
                FIRST_UPLOAD_AT.minusSeconds(17).plusNanos(456789000)
        );
        ParkingCsvRow unchanged = new ParkingCsvRow(unchangedBase.rowNumber(), unchangedBase.lot(), partial);
        Instant createdAt = FIRST_UPLOAD_AT.plusNanos(111111000);
        Instant updatedAt = NEXT_UPLOAD_AT.plusNanos(222222000);
        sync(List.of(lotOnly, operationOnly, unchanged), createdAt);
        List<ParkingDbRow> before = findAll(jdbc);
        ParkingLotValues old = lotOnly.lot();
        ParkingLotValues nullableLot = new ParkingLotValues(
                old.source(), old.sourceExternalId(), old.name(), null, old.sigungu(), old.address(),
                null, null, null, old.mechanical(), old.isPublic(), old.active(), old.sourceCheckedAt().plusNanos(345678000)
        );
        List<ParkingCsvRow> uploaded = List.of(
                new ParkingCsvRow(lotOnly.rowNumber(), nullableLot, lotOnly.operation()),
                new ParkingCsvRow(operationOnly.rowNumber(), operationOnly.lot(), partial),
                unchanged
        );

        // when
        ParkingCsvSummaryResponse summary = sync(uploaded, updatedAt);

        // then
        assertSummary(summary, 0, 2, 0, 0, 1);
        List<ParkingDbRow> saved = findAll(jdbc);
        for (int index = 0; index < uploaded.size(); index++) {
            assertThat(saved.get(index)).isEqualTo(new ParkingDbRow(
                    before.get(index).id(), uploaded.get(index).lot(), uploaded.get(index).operation()
            ));
        }
        Map<Long, RowAudit> audit = audits();
        assertThat(audit.get(before.get(0).id())).isEqualTo(new RowAudit(createdAt, updatedAt, createdAt, createdAt));
        assertThat(audit.get(before.get(1).id())).isEqualTo(new RowAudit(createdAt, createdAt, createdAt, updatedAt));
        assertThat(audit.get(before.get(2).id())).isEqualTo(new RowAudit(createdAt, createdAt, createdAt, createdAt));
        assertThat(jdbc.queryForObject(
                "SELECT location IS NULL FROM parking_lots WHERE id = ?", Boolean.class, before.get(0).id()
        )).isTrue();

        // given
        DatabaseState beforeRepeat = databaseState();

        // when
        ParkingCsvSummaryResponse repeated = sync(uploaded, updatedAt.plusSeconds(1));

        // then
        assertSummary(repeated, 0, 0, 0, 0, 3);
        assertThat(databaseState()).isEqualTo(beforeRepeat);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    @DisplayName("뒤쪽 CSV 배치의 운영정보 저장 실패는 앞선 배치의 수정을 모두 롤백한다")
    void rolls_back_all_earlier_pages_when_later_operation_write_fails(boolean missingOperation) {
        // given
        List<ParkingCsvRow> initial = initialRows();
        sync(initial, FIRST_UPLOAD_AT);
        int invalidIndex = 1001;
        if (missingOperation) {
            long id = byName(findAll(jdbc)).get(name(invalidIndex)).id();
            jdbc.update("DELETE FROM parking_operations WHERE parking_lot_id = ?", id);
        }
        DatabaseState before = databaseState();
        List<ParkingCsvRow> uploaded = changedRowsWithOmissions();
        try {
            installOperationFailureTrigger("source-" + invalidIndex + "-2");

            // when & then
            assertThatThrownBy(() -> sync(uploaded, NEXT_UPLOAD_AT))
                    .isInstanceOf(DataIntegrityViolationException.class);
            assertThat(databaseState()).isEqualTo(before);
        } finally {
            removeOperationFailureTrigger();
        }
    }

    @Test
    @DisplayName("두 번째 신규 배치 저장 실패는 기존 행 변경과 첫 신규 배치 추가를 모두 롤백한다")
    void rolls_back_existing_changes_and_new_rows_when_final_insert_batch_fails() {
        // given
        sync(initialRows(), FIRST_UPLOAD_AT);
        DatabaseState before = databaseState();
        List<ParkingCsvRow> uploaded = changedRowsWithOmissions();
        for (int index = EXISTING_COUNT; index < EXISTING_COUNT + ADDED_COUNT; index++) {
            uploaded.add(row(index, 2, true));
        }
        try {
            installOperationFailureTrigger(uploaded.getLast().lot().sourceExternalId());

            // when & then
            assertThatThrownBy(() -> sync(uploaded, NEXT_UPLOAD_AT))
                    .isInstanceOf(DataIntegrityViolationException.class);
            assertThat(databaseState()).isEqualTo(before);
        } finally {
            removeOperationFailureTrigger();
        }
    }

    @ParameterizedTest
    @CsvSource(value = {
            "NULL, true", "NULL, false", "true, false", "false, true", "true, NULL", "false, NULL",
            "NULL, NULL", "true, true", "false, false"
    }, nullValues = "NULL")
    @DisplayName("DB 비교 경로에서도 공영 여부 세 상태의 변경과 동일 값을 구분하고 저장한다")
    void compares_and_stores_all_public_flag_transitions(Boolean before, Boolean after) {
        // given
        ParkingCsvRow original = withPublicFlag(row(0, 1, true), before);
        sync(List.of(original), FIRST_UPLOAD_AT);
        ParkingDbRow initial = findAll(jdbc).getFirst();
        ParkingCsvRow changed = withPublicFlag(original, after);
        int expectedUpdated = 1;
        Instant expectedUpdatedAt = NEXT_UPLOAD_AT;
        if (Objects.equals(before, after)) {
            expectedUpdated = 0;
            expectedUpdatedAt = FIRST_UPLOAD_AT;
        }

        // when
        ParkingCsvSummaryResponse updated = sync(List.of(changed), NEXT_UPLOAD_AT);
        ParkingCsvSummaryResponse repeated = sync(List.of(changed), NEXT_UPLOAD_AT.plusSeconds(1));

        // then
        ParkingDbRow saved = findAll(jdbc).getFirst();
        assertSummary(updated, 0, expectedUpdated, 0, 0, 1 - expectedUpdated);
        assertSummary(repeated, 0, 0, 0, 0, 1);
        assertThat(saved.id()).isEqualTo(initial.id());
        assertThat(saved.lot()).isEqualTo(changed.lot());
        assertThat(saved.operation()).isEqualTo(initial.operation());
        assertThat(jdbc.queryForObject("SELECT is_public FROM parking_lots WHERE id = ?", Boolean.class, saved.id()))
                .isEqualTo(after);
        assertThat(audits().get(saved.id())).isEqualTo(new RowAudit(
                FIRST_UPLOAD_AT, expectedUpdatedAt, FIRST_UPLOAD_AT, FIRST_UPLOAD_AT
        ));
    }

    @Test
    @DisplayName("500행을 넘는 좌표 변경은 보행 노드 연결을 갱신하고 좌표를 지우면 연결도 제거한다")
    void refreshes_walking_nodes_across_update_batches_and_removes_cleared_coordinates() {
        // given
        jdbc.update("""
                INSERT INTO walking_nodes (id, geom) VALUES
                    (1, ST_SetSRID(ST_MakePoint(127.1, 37.1), 4326)),
                    (2, ST_SetSRID(ST_MakePoint(127.1001, 37.1), 4326)),
                    (3, ST_SetSRID(ST_MakePoint(127.2, 37.2), 4326)),
                    (4, ST_SetSRID(ST_MakePoint(127.2001, 37.2), 4326))
                """);
        jdbc.update("""
                INSERT INTO walking_edges (id, source, target, geom, cost, reverse_cost) VALUES
                    (1, 1, 2, ST_GeomFromText('LINESTRING (127.1 37.1, 127.1001 37.1)', 4326), 10, 10),
                    (2, 3, 4, ST_GeomFromText('LINESTRING (127.2 37.2, 127.2001 37.2)', 4326), 10, 10)
                """);
        jdbc.update("""
                INSERT INTO walking_network_metadata
                    (id, status, source, source_row_count, node_count, edge_count, imported_at,
                     candidate_nodes_snap_radius_meters)
                VALUES (1, 'READY', 'TEST', 6, 4, 2, current_timestamp, 100)
                """);
        List<ParkingCsvRow> original = new ArrayList<>();
        List<ParkingCsvRow> changed = new ArrayList<>();
        for (int index = 0; index < 501; index++) {
            original.add(row(index, 1, true));
            changed.add(row(index, 2, true));
        }
        sync(original, FIRST_UPLOAD_AT);
        assertThat(jdbc.queryForList("SELECT DISTINCT walking_node_id FROM parking_lot_walking_nodes ORDER BY 1", Long.class))
                .containsExactly(1L, 2L);
        long lastId = byName(findAll(jdbc)).get(name(500)).id();

        // when
        ParkingCsvSummaryResponse updated = sync(changed, NEXT_UPLOAD_AT);

        // then
        assertSummary(updated, 0, 501, 0, 0, 0);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM parking_lot_walking_nodes", Integer.class)).isEqualTo(1002);
        assertThat(jdbc.queryForList("SELECT DISTINCT walking_node_id FROM parking_lot_walking_nodes ORDER BY 1", Long.class))
                .containsExactly(3L, 4L);

        // given
        ParkingCsvRow last = changed.getLast();
        ParkingLotValues lot = last.lot();
        ParkingLotValues cleared = new ParkingLotValues(
                lot.source(), lot.sourceExternalId(), lot.name(), lot.sido(), lot.sigungu(), lot.address(),
                null, null, lot.capacity(), lot.mechanical(), lot.isPublic(), lot.active(), lot.sourceCheckedAt()
        );
        changed.set(500, new ParkingCsvRow(last.rowNumber(), cleared, last.operation()));

        // when
        ParkingCsvSummaryResponse clearedSummary = sync(changed, NEXT_UPLOAD_AT.plusSeconds(1));

        // then
        assertSummary(clearedSummary, 0, 1, 0, 0, 500);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM parking_lot_walking_nodes WHERE parking_lot_id = ?",
                Integer.class, lastId)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM parking_lot_walking_nodes", Integer.class)).isEqualTo(1000);
    }

    private ParkingCsvRow withPublicFlag(ParkingCsvRow row, Boolean isPublic) {
        ParkingLotValues old = row.lot();
        ParkingLotValues lot = new ParkingLotValues(
                old.source(), old.sourceExternalId(), old.name(), old.sido(), old.sigungu(), old.address(),
                old.latitude(), old.longitude(), old.capacity(), old.mechanical(), isPublic, old.active(), old.sourceCheckedAt()
        );
        return new ParkingCsvRow(row.rowNumber(), lot, row.operation());
    }

    private ParkingCsvSummaryResponse sync(List<ParkingCsvRow> rows, Instant now) {
        when(clock.instant()).thenReturn(now);
        MockMultipartFile file = new MockMultipartFile(
                "file", "test.csv", "text/csv", csv(rows).getBytes(StandardCharsets.UTF_8)
        );
        return importService.importFile(file).summary();
    }

    private String csv(List<ParkingCsvRow> rows) {
        StringBuilder csv = new StringBuilder(String.join(",", ParkingCsvColumn.headers())).append('\n');
        for (ParkingCsvRow row : rows) {
            String[] fields = csvFields(row);
            for (int index = 0; index < fields.length; index++) {
                if (index > 0) {
                    csv.append(',');
                }
                csv.append('"').append(fields[index].replace("\"", "\"\"")).append('"');
            }
            csv.append('\n');
        }
        return csv.toString();
    }

    private String[] csvFields(ParkingCsvRow row) {
        String[] fields = new String[ParkingCsvColumn.values().length];
        Arrays.fill(fields, "");
        ParkingLotValues lot = row.lot();
        setField(fields, ParkingCsvColumn.SOURCE, lot.source());
        setField(fields, ParkingCsvColumn.SOURCE_EXTERNAL_ID, lot.sourceExternalId());
        setField(fields, ParkingCsvColumn.NAME, lot.name());
        setField(fields, ParkingCsvColumn.SIDO, lot.sido());
        setField(fields, ParkingCsvColumn.SIGUNGU, lot.sigungu());
        setField(fields, ParkingCsvColumn.ADDRESS, lot.address());
        setField(fields, ParkingCsvColumn.LATITUDE, lot.latitude());
        setField(fields, ParkingCsvColumn.LONGITUDE, lot.longitude());
        setField(fields, ParkingCsvColumn.CAPACITY, lot.capacity());
        setField(fields, ParkingCsvColumn.MECHANICAL, "N");
        if (lot.mechanical()) {
            setField(fields, ParkingCsvColumn.MECHANICAL, "Y");
        }
        setField(fields, ParkingCsvColumn.IS_PUBLIC, lot.isPublic());
        setField(fields, ParkingCsvColumn.ACTIVE, lot.active());
        setField(fields, ParkingCsvColumn.LOT_SOURCE_CHECKED_AT, lot.sourceCheckedAt());

        ParkingOperationValues operation = row.operation();
        setField(fields, ParkingCsvColumn.BASE_FREE_MINUTES, operation.baseFreeMinutes());
        setField(fields, ParkingCsvColumn.BASE_MINUTES, operation.baseMinutes());
        setField(fields, ParkingCsvColumn.BASE_FEE, operation.baseFee());
        setField(fields, ParkingCsvColumn.ADDITIONAL_MINUTES, operation.additionalMinutes());
        setField(fields, ParkingCsvColumn.ADDITIONAL_FEE, operation.additionalFee());
        setField(fields, ParkingCsvColumn.DAILY_MAX_FEE, operation.dailyMaxFee());
        setField(fields, ParkingCsvColumn.MONTHLY_FEE, operation.monthlyFee());
        setField(fields, ParkingCsvColumn.WEEKDAY_PAID, operation.weekdayPaid());
        setField(fields, ParkingCsvColumn.SATURDAY_PAID, operation.saturdayPaid());
        setField(fields, ParkingCsvColumn.HOLIDAY_PAID, operation.holidayPaid());
        setField(fields, ParkingCsvColumn.WEEKDAY_STATUS, operation.weekday().status());
        setField(fields, ParkingCsvColumn.WEEKDAY_OPEN_TIME, operation.weekday().openTime());
        setField(fields, ParkingCsvColumn.WEEKDAY_CLOSE_TIME, operation.weekday().closeTime());
        setField(fields, ParkingCsvColumn.WEEKEND_STATUS, operation.weekend().status());
        setField(fields, ParkingCsvColumn.WEEKEND_OPEN_TIME, operation.weekend().openTime());
        setField(fields, ParkingCsvColumn.WEEKEND_CLOSE_TIME, operation.weekend().closeTime());
        setField(fields, ParkingCsvColumn.HOLIDAY_STATUS, operation.holiday().status());
        setField(fields, ParkingCsvColumn.HOLIDAY_OPEN_TIME, operation.holiday().openTime());
        setField(fields, ParkingCsvColumn.HOLIDAY_CLOSE_TIME, operation.holiday().closeTime());
        setField(fields, ParkingCsvColumn.OPERATION_SOURCE_CHECKED_AT, operation.sourceCheckedAt());
        return fields;
    }

    private void setField(String[] fields, ParkingCsvColumn column, Object value) {
        fields[column.ordinal()] = Objects.toString(value, "");
    }

    private void installOperationFailureTrigger(String sourceExternalId) {
        jdbc.execute("""
                CREATE FUNCTION csv_sync_test_reject_operation() RETURNS trigger AS $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM parking_lots
                        WHERE id = NEW.parking_lot_id AND source_external_id = '%s'
                    ) THEN
                        RAISE EXCEPTION 'CSV operation rollback test' USING ERRCODE = '23514';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql
                """.formatted(sourceExternalId));
        jdbc.execute("""
                CREATE TRIGGER csv_sync_test_reject_operation
                BEFORE INSERT OR UPDATE ON parking_operations
                FOR EACH ROW EXECUTE FUNCTION csv_sync_test_reject_operation()
                """);
    }

    private void removeOperationFailureTrigger() {
        jdbc.execute("DROP TRIGGER IF EXISTS csv_sync_test_reject_operation ON parking_operations");
        jdbc.execute("DROP FUNCTION IF EXISTS csv_sync_test_reject_operation()");
    }

    private List<ParkingCsvRow> initialRows() {
        List<ParkingCsvRow> rows = new ArrayList<>();
        for (int index = 0; index < EXISTING_COUNT; index++) {
            rows.add(row(index, 1, true));
        }
        return rows;
    }

    private List<ParkingCsvRow> changedRowsWithOmissions() {
        List<ParkingCsvRow> rows = new ArrayList<>();
        for (int index = 0; index < EXISTING_COUNT; index++) {
            if (index % 3 != 0) {
                rows.add(row(index, 2, true));
            }
        }
        return rows;
    }

    private void addExpected(List<ParkingCsvRow> uploaded, Map<String, ParkingCsvRow> expected, ParkingCsvRow row) {
        uploaded.add(row);
        expected.put(row.lot().name(), row);
    }

    private ParkingCsvRow row(int index, int version, boolean active) {
        Instant sourceCheckedAt = FIRST_UPLOAD_AT.minusSeconds(60).plusSeconds(version);
        ParkingLotValues lot = new ParkingLotValues(
                ParkingDataSource.DATA_GO_KR, "source-" + index + "-" + version, name(index),
                "시도-" + version, "시군구-" + version, "주소-" + index,
                37.0 + version * 0.1, 127.0 + version * 0.1,
                100 * version, version == 2, null, active, sourceCheckedAt
        );
        ParkingScheduleValues schedule = new ParkingScheduleValues(
                ParkingOperationStatus.OPEN, LocalTime.of(8 + version, 0), LocalTime.of(18 + version, 0)
        );
        ParkingOperationValues operation = new ParkingOperationValues(
                5 * version, 30 * version, 1000 * version, 10 * version, 500 * version,
                10000 * version, 100000 * version, version == 1, version == 2, version == 1,
                schedule, schedule, schedule, sourceCheckedAt
        );
        return new ParkingCsvRow(index + 2L, lot, operation);
    }

    private String name(int index) {
        return "배치 주차장-" + index;
    }

    private Map<String, ParkingDbRow> byName(List<ParkingDbRow> rows) {
        return rows.stream().collect(Collectors.toMap(row -> row.lot().name(), Function.identity()));
    }

    private Map<Long, RowAudit> audits() {
        Map<Long, RowAudit> result = new HashMap<>();
        jdbc.query("""
                SELECT l.id, l.created_at, l.updated_at,
                       o.created_at AS operation_created_at, o.updated_at AS operation_updated_at
                FROM parking_lots l JOIN parking_operations o ON o.parking_lot_id = l.id
                """, row -> {
            result.put(row.getLong("id"), new RowAudit(
                    row.getObject("created_at", OffsetDateTime.class).toInstant(),
                    row.getObject("updated_at", OffsetDateTime.class).toInstant(),
                    row.getObject("operation_created_at", OffsetDateTime.class).toInstant(),
                    row.getObject("operation_updated_at", OffsetDateTime.class).toInstant()
            ));
        });
        return result;
    }

    private DatabaseState databaseState() {
        return new DatabaseState(
                jdbc.queryForList("SELECT row_to_json(l)::text FROM parking_lots l ORDER BY id", String.class),
                jdbc.queryForList("SELECT row_to_json(o)::text FROM parking_operations o ORDER BY parking_lot_id", String.class)
        );
    }

    private void assertSummary(ParkingCsvSummaryResponse summary, int added, int updated,
                               int reactivated, int deactivated, int unchanged) {
        assertThat(summary.addedCount()).isEqualTo(added);
        assertThat(summary.updatedCount()).isEqualTo(updated);
        assertThat(summary.reactivatedCount()).isEqualTo(reactivated);
        assertThat(summary.deactivatedCount()).isEqualTo(deactivated);
        assertThat(summary.unchangedCount()).isEqualTo(unchanged);
    }

    private record RowAudit(Instant lotCreatedAt, Instant lotUpdatedAt,
                            Instant operationCreatedAt, Instant operationUpdatedAt) {
    }

    private record DatabaseState(List<String> lots, List<String> operations) {
    }
}
