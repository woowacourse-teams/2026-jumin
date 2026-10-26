package jumin.domain.admin.parking.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Savepoint;
import java.sql.Statement;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import javax.sql.DataSource;
import jumin.TestcontainersConfiguration;
import jumin.domain.admin.parking.model.ParkingChanges;
import jumin.domain.admin.parking.model.ParkingCsvKey;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.domain.admin.parking.model.ParkingDbRow;
import jumin.domain.admin.parking.model.ParkingKey;
import jumin.domain.admin.parking.model.ParkingLotValues;
import jumin.domain.admin.parking.model.ParkingOperationValues;
import jumin.domain.admin.parking.model.ParkingScheduleValues;
import jumin.domain.admin.parking.service.ParkingCsvDiffer;
import jumin.domain.parking.entity.ParkingDataSource;
import jumin.domain.parking.entity.ParkingOperationStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

@DataJpaTest
@ActiveProfiles("test")
@Import({TestcontainersConfiguration.class, ParkingCsvRepository.class})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(FlywayAutoConfiguration.class)
class ParkingCsvRepositoryTest {

    private static final Instant SOURCE_CHECKED_AT = Instant.parse("2026-09-28T09:42:55Z");
    private static final Instant FIRST_UPLOAD_AT = Instant.parse("2026-09-29T01:00:00Z");
    private static final Instant NEXT_UPLOAD_AT = FIRST_UPLOAD_AT.plusSeconds(3600);

    @Autowired
    private ParkingCsvRepository repository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private final ParkingCsvDiffer differ = new ParkingCsvDiffer();

    @Test
    @DisplayName("DB가 생성한 ID로 두 테이블을 연결하고 위치 트리거와 원본 시각을 보존한다")
    void inserts_with_generated_ids_operation_foreign_keys_and_location() {
        // given
        ParkingCsvRow row = row("신규 주차장", 1000);

        // when
        sync(List.of(row), FIRST_UPLOAD_AT);
        ParkingDbRow saved = repository.findAll().getFirst();

        // then
        assertThat(saved.id()).isPositive();
        assertThat(saved.lot()).isEqualTo(row.lot());
        assertThat(saved.operation()).isEqualTo(row.operation());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT parking_lot_id FROM parking_operations", Long.class
        )).isEqualTo(saved.id());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT ST_X(location::geometry) FROM parking_lots WHERE id = ?", Double.class, saved.id()
        )).isEqualTo(127.0279);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT ST_Y(location::geometry) FROM parking_lots WHERE id = ?", Double.class, saved.id()
        )).isEqualTo(37.4981);
        assertThat(timestamps(saved.id(), "parking_lots")).containsExactly(FIRST_UPLOAD_AT, FIRST_UPLOAD_AT);
        assertThat(timestamps(saved.id(), "parking_operations")).containsExactly(FIRST_UPLOAD_AT, FIRST_UPLOAD_AT);
    }

    @Test
    @DisplayName("동일한 CSV를 다시 저장하면 두 테이블의 ID와 수정 시각을 유지한다")
    void reupload_does_not_update_unchanged_rows() {
        // given
        ParkingCsvRow row = row("변경 없는 주차장", 1000);
        sync(List.of(row), FIRST_UPLOAD_AT);
        long id = repository.findAll().getFirst().id();

        // when
        ParkingChanges changes = sync(List.of(row), NEXT_UPLOAD_AT);

        // then
        assertThat(changes.unchangedCount()).isEqualTo(1);
        assertThat(changes.added()).isEmpty();
        assertThat(changes.updated()).isEmpty();
        assertThat(changes.deactivated()).isEmpty();
        assertThat(repository.findAll().getFirst().id()).isEqualTo(id);
        assertThat(timestamps(id, "parking_lots")).containsExactly(FIRST_UPLOAD_AT, FIRST_UPLOAD_AT);
        assertThat(timestamps(id, "parking_operations")).containsExactly(FIRST_UPLOAD_AT, FIRST_UPLOAD_AT);
    }

    @Test
    @DisplayName("요금만 바뀌면 주차장 ID와 기본정보는 유지하고 운영정보 수정 시각만 변경한다")
    void updates_only_operation_when_fee_changes() {
        // given
        sync(List.of(row("요금 수정", 1000)), FIRST_UPLOAD_AT);
        long id = repository.findAll().getFirst().id();

        // when
        sync(List.of(row("요금 수정", 1500)), NEXT_UPLOAD_AT);

        // then
        ParkingDbRow saved = repository.findAll().getFirst();
        assertThat(saved.id()).isEqualTo(id);
        assertThat(saved.operation().baseFee()).isEqualTo(1500);
        assertThat(timestamps(id, "parking_lots")).containsExactly(FIRST_UPLOAD_AT, FIRST_UPLOAD_AT);
        assertThat(timestamps(id, "parking_operations")).containsExactly(FIRST_UPLOAD_AT, NEXT_UPLOAD_AT);
    }

    @Test
    @DisplayName("CSV에서 빠진 행은 운영정보를 유지하며 비활성화하고 재등장하면 기존 ID로 활성화한다")
    void deactivates_missing_rows_and_reactivates_with_existing_id() {
        // given
        ParkingCsvRow returning = row("재등장 주차장", 1000);
        ParkingCsvRow remaining = row("계속 있는 주차장", 2000);
        sync(List.of(returning, remaining), FIRST_UPLOAD_AT);
        long returningId = findByName(returning.lot().name()).id();

        // when
        ParkingChanges missing = sync(List.of(remaining), NEXT_UPLOAD_AT);
        ParkingDbRow inactive = findByName(returning.lot().name());
        ParkingChanges stillMissing = sync(List.of(remaining), NEXT_UPLOAD_AT.plusSeconds(1));
        Instant inactiveUpdatedAt = timestamps(returningId, "parking_lots").get(1);
        sync(List.of(returning, remaining), NEXT_UPLOAD_AT.plusSeconds(2));

        // then
        assertThat(missing.deactivated()).hasSize(1);
        assertThat(inactive.lot().active()).isFalse();
        assertThat(inactive.lot().sourceCheckedAt()).isEqualTo(SOURCE_CHECKED_AT);
        assertThat(inactive.operation()).isEqualTo(returning.operation());
        assertThat(stillMissing.deactivated()).isEmpty();
        assertThat(inactiveUpdatedAt).isEqualTo(NEXT_UPLOAD_AT);
        ParkingDbRow reactivated = findByName(returning.lot().name());
        assertThat(reactivated.id()).isEqualTo(returningId);
        assertThat(reactivated.lot().active()).isTrue();
        assertThat(timestamps(returningId, "parking_operations")).containsExactly(FIRST_UPLOAD_AT, FIRST_UPLOAD_AT);
    }

    @Test
    @DisplayName("이름 변경은 동일 출처 ID를 유지해도 기존 행 비활성화와 새 ID 추가로 저장한다")
    void permits_renamed_lot_with_same_source_external_id() {
        // given
        sync(List.of(row("변경 전 이름", 1000)), FIRST_UPLOAD_AT);
        long oldId = repository.findAll().getFirst().id();

        // when
        sync(List.of(row("변경 후 이름", 1000)), NEXT_UPLOAD_AT);

        // then
        assertThat(repository.findAll()).hasSize(2);
        assertThat(findByName("변경 전 이름").lot().active()).isFalse();
        ParkingDbRow newLot = findByName("변경 후 이름");
        assertThat(newLot.id()).isNotEqualTo(oldId);
        assertThat(newLot.lot().active()).isTrue();
        assertThat(newLot.lot().sourceExternalId()).isEqualTo("shared-source-id");
    }

    @Test
    @DisplayName("LEFT JOIN은 운영정보가 없는 주차장을 포함하며 기존 ID로 운영정보를 추가한다")
    void fills_missing_operation_without_changing_lot() {
        // given
        ParkingCsvRow row = row("운영정보 누락", 1000);
        sync(List.of(row), FIRST_UPLOAD_AT);
        long id = repository.findAll().getFirst().id();
        jdbcTemplate.update("DELETE FROM parking_operations WHERE parking_lot_id = ?", id);
        ParkingDbRow before = repository.findAll().getFirst();

        // when
        sync(List.of(row), NEXT_UPLOAD_AT);

        // then
        assertThat(before.operation()).isNull();
        ParkingDbRow after = repository.findAll().getFirst();
        assertThat(after.id()).isEqualTo(id);
        assertThat(after.operation()).isEqualTo(row.operation());
        assertThat(timestamps(id, "parking_lots")).containsExactly(FIRST_UPLOAD_AT, FIRST_UPLOAD_AT);
        assertThat(timestamps(id, "parking_operations")).containsExactly(NEXT_UPLOAD_AT, NEXT_UPLOAD_AT);
    }

    @Test
    @DisplayName("좌표와 선택값을 null로 바꾸면 기존 값과 위치를 지우고 운영정보는 변경하지 않는다")
    void clears_nullable_lot_fields_and_derived_location() {
        // given
        ParkingCsvRow row = row("선택값 초기화", 1000);
        sync(List.of(row), FIRST_UPLOAD_AT);
        long id = repository.findAll().getFirst().id();
        ParkingLotValues old = row.lot();
        ParkingCsvRow cleared = new ParkingCsvRow(row.rowNumber(), new ParkingLotValues(
                old.source(), old.sourceExternalId(), old.name(), null, null, old.address(),
                null, null, null, old.mechanical(), old.isPublic(), old.active(), old.sourceCheckedAt()
        ), row.operation());

        // when
        sync(List.of(cleared), NEXT_UPLOAD_AT);

        // then
        ParkingDbRow saved = repository.findAll().getFirst();
        assertThat(saved.lot()).isEqualTo(cleared.lot());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT location IS NULL FROM parking_lots WHERE id = ?", Boolean.class, id
        )).isTrue();
        assertThat(timestamps(id, "parking_operations")).containsExactly(FIRST_UPLOAD_AT, FIRST_UPLOAD_AT);
    }

    @Test
    @DisplayName("OPEN 시간 누락과 다른 상태의 시간을 그대로 저장하고 DB의 소수초도 손실 없이 읽는다")
    void preserves_partial_schedule_and_fractional_database_times() {
        // given
        ParkingScheduleValues weekday = new ParkingScheduleValues(ParkingOperationStatus.OPEN, null, LocalTime.NOON);
        LocalTime fractionalTime = LocalTime.of(9, 0, 0, 123456000);
        ParkingScheduleValues weekend = new ParkingScheduleValues(ParkingOperationStatus.UNKNOWN, fractionalTime, null);
        ParkingScheduleValues holiday = new ParkingScheduleValues(null, LocalTime.NOON, LocalTime.NOON);
        ParkingOperationValues operation = new ParkingOperationValues(
                null, null, null, null, null, null, null,
                null, null, null, weekday, weekend, holiday, SOURCE_CHECKED_AT
        );
        ParkingCsvRow base = row("불완전한 운영시간", 1000);
        ParkingCsvRow row = new ParkingCsvRow(2, base.lot(), operation);

        // when
        sync(List.of(row), FIRST_UPLOAD_AT);
        ParkingOperationValues saved = repository.findAll().getFirst().operation();

        // then
        assertThat(saved).isEqualTo(operation);
        assertThat(saved.weekend().openTime()).isEqualTo(fractionalTime);
    }

    @Test
    @DisplayName("500행을 넘어도 DB에서 반환한 키별 ID로 운영정보를 정확히 연결한다")
    void inserts_multiple_batches_with_correct_generated_id_mapping() {
        // given
        List<ParkingCsvRow> rows = new ArrayList<>();
        for (int index = 1000; index >= 0; index--) {
            rows.add(row("일괄 주차장 " + index, index));
        }

        // when
        sync(rows, FIRST_UPLOAD_AT);

        // then
        List<ParkingDbRow> savedRows = repository.findAll();
        assertThat(savedRows).hasSize(1001);
        for (ParkingDbRow saved : savedRows) {
            int expectedFee = Integer.parseInt(saved.lot().name().substring("일괄 주차장 ".length()));
            assertThat(saved.operation().baseFee()).isEqualTo(expectedFee);
        }
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM parking_operations", Integer.class
        )).isEqualTo(1001);
    }

    @Test
    @DisplayName("다음 배치의 운영정보 저장 실패 시 앞선 배치의 두 테이블까지 전부 롤백한다")
    void rolls_back_previous_batches_when_later_operation_insert_fails() {
        // given
        List<ParkingCsvRow> rows = new ArrayList<>();
        for (int index = 0; index < 500; index++) {
            rows.add(row("롤백 대상 " + index, index));
        }
        rows.add(row("롤백 오류", -1));
        TransactionTemplate transaction = newTransaction();

        // when & then
        assertThatThrownBy(() -> transaction.executeWithoutResult(status -> sync(rows, FIRST_UPLOAD_AT)))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(repository.findAll()).isEmpty();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM parking_operations", Integer.class
        )).isZero();
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    @DisplayName("두 연결의 동시 잠금은 충돌하고 커밋 후에는 다음 업로드가 잠금을 얻는다")
    void holds_advisory_lock_until_transaction_completes() {
        // given
        TransactionTemplate first = newTransaction();
        TransactionTemplate second = newTransaction();

        // when
        boolean firstLocked = first.execute(status -> {
            boolean locked = repository.tryAcquireLock();
            Boolean secondLocked = second.execute(other -> repository.tryAcquireLock());
            assertThat(secondLocked).isFalse();
            return locked;
        });
        Boolean lockedAfterCommit = second.execute(status -> repository.tryAcquireLock());

        // then
        assertThat(firstLocked).isTrue();
        assertThat(lockedAfterCommit).isTrue();
    }

    @Test
    @DisplayName("이름과 주소의 앞뒤 공백을 제거한 키는 활성 상태와 무관하게 DB에서도 유일하다")
    void rejects_normalized_duplicate_keys_in_database() {
        // given
        sync(List.of(row("중복 검사", 1000)), FIRST_UPLOAD_AT);

        // when & then
        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO parking_lots (
                    source, source_external_id, name, address, active,
                    source_checked_at, created_at, updated_at
                ) VALUES ('DATA_GO_KR', 'another-id', ' 중복 검사 ', ' 서울시 테스트 주소 ', FALSE,
                    current_timestamp, current_timestamp, current_timestamp)
                """))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("idx_parking_lots_name_address");
    }

    @Test
    @DisplayName("V8은 기존 이름, 주소 중복을 발견하면 새 제약 적용과 기존 제약 제거 전에 실패한다")
    void migration_refuses_existing_duplicates_before_changing_constraints() throws Exception {
        // given
        String migration = new ClassPathResource("db/migration/V8__change_parking_identity_to_name_address.sql")
                .getContentAsString(StandardCharsets.UTF_8);
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            connection.setAutoCommit(false);
            try {
                statement.execute("CREATE SCHEMA csv_migration_test");
                statement.execute("SET LOCAL search_path TO csv_migration_test");
                statement.execute("CREATE TABLE parking_lots (name TEXT, address TEXT, source TEXT, source_external_id TEXT)");
                statement.execute("CREATE UNIQUE INDEX idx_parking_lots_source_external_id ON parking_lots (source, source_external_id)");
                statement.execute("INSERT INTO parking_lots VALUES ('same', NULL, 'DATA_GO_KR', '1'), (' same ', ' ', 'DATA_GO_KR', '2')");
                Savepoint beforeMigration = connection.setSavepoint();

                // when & then
                assertThatThrownBy(() -> statement.execute(migration))
                        .hasMessageContaining("duplicate trimmed (name, address) keys exist");
                connection.rollback(beforeMigration);
                try (ResultSet indexes = statement.executeQuery("""
                        SELECT indexname FROM pg_indexes WHERE schemaname = 'csv_migration_test'
                        """)) {
                    assertThat(indexes.next()).isTrue();
                    assertThat(indexes.getString(1)).isEqualTo("idx_parking_lots_source_external_id");
                    assertThat(indexes.next()).isFalse();
                }
            } finally {
                connection.rollback();
            }
        }
    }

    @Test
    @DisplayName("기계식 정보의 추가와 변경을 저장한다")
    void persists_mechanical_flag_changes() {
        // given
        sync(List.of(row("기계식 변경", 1000, true)), FIRST_UPLOAD_AT);
        ParkingDbRow initial = repository.findAll().getFirst();
        assertThat(initial.lot().mechanical()).isTrue();

        // when
        ParkingChanges updated = sync(List.of(row("기계식 변경", 1000, false)), NEXT_UPLOAD_AT);

        // then
        assertThat(updated.updated()).hasSize(1);
        ParkingDbRow saved = repository.findAll().getFirst();
        assertThat(saved.id()).isEqualTo(initial.id());
        assertThat(saved.lot().mechanical()).isFalse();
        assertThat(timestamps(saved.id(), "parking_operations")).containsExactly(FIRST_UPLOAD_AT, FIRST_UPLOAD_AT);
    }

    @Test
    @DisplayName("기계식 정보를 비기계식으로 변경하고 동일 입력은 재저장하지 않는다")
    void updates_mechanical_flag_to_false_and_skips_unchanged_input() {
        // given
        sync(List.of(row("기계식 변경", 1000, true)), FIRST_UPLOAD_AT);
        ParkingCsvRow nonMechanical = row("기계식 변경", 1000, false);

        // when
        sync(List.of(nonMechanical), NEXT_UPLOAD_AT);
        ParkingChanges repeated = sync(List.of(nonMechanical), NEXT_UPLOAD_AT.plusSeconds(3600));

        // then
        ParkingDbRow saved = repository.findAll().getFirst();
        assertThat(saved.lot().mechanical()).isFalse();
        assertThat(repeated.updated()).isEmpty();
        assertThat(repeated.unchangedCount()).isEqualTo(1);
        assertThat(timestamps(saved.id(), "parking_lots")).containsExactly(FIRST_UPLOAD_AT, NEXT_UPLOAD_AT);
    }

    @Test
    @DisplayName("V11은 기존 행과 신규 행의 기계식 기본값을 false로 설정하고 null을 금지한다")
    void migration_defaults_mechanical_to_false_and_rejects_null() throws Exception {
        // given
        String migration = new ClassPathResource("db/migration/V11__add_parking_mechanical.sql")
                .getContentAsString(StandardCharsets.UTF_8);
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            connection.setAutoCommit(false);
            try {
                statement.execute("CREATE SCHEMA mechanical_migration_test");
                statement.execute("SET LOCAL search_path TO mechanical_migration_test");
                statement.execute("CREATE TABLE parking_lots (id INTEGER PRIMARY KEY)");
                statement.execute("INSERT INTO parking_lots VALUES (1), (2)");

                // when
                statement.execute(migration);
                statement.execute("INSERT INTO parking_lots (id) VALUES (3)");
                statement.execute("INSERT INTO parking_lots VALUES (4, TRUE), (5, FALSE)");

                // then
                try (ResultSet rows = statement.executeQuery("SELECT mechanical FROM parking_lots ORDER BY id")) {
                    List<Boolean> flags = new ArrayList<>();
                    while (rows.next()) {
                        flags.add(rows.getObject("mechanical", Boolean.class));
                    }
                    assertThat(flags).containsExactly(false, false, false, true, false);
                }
                assertThatThrownBy(() -> statement.execute("INSERT INTO parking_lots VALUES (6, NULL)"))
                        .hasMessageContaining("not-null constraint");
            } finally {
                connection.rollback();
            }
        }
    }

    @ParameterizedTest
    @CsvSource(value = {
            "NULL, true", "NULL, false", "true, false", "false, true", "true, NULL", "false, NULL"
    }, nullValues = "NULL")
    @DisplayName("공영 여부의 세 상태를 저장하고 변경 후 동일 입력은 재저장하지 않는다")
    void persists_is_public_changes_and_skips_unchanged_input(Boolean before, Boolean after) {
        // given
        sync(List.of(row("공영 변경", 1000, false, before)), FIRST_UPLOAD_AT);
        ParkingDbRow initial = repository.findAll().getFirst();
        assertThat(initial.lot().isPublic()).isEqualTo(before);
        ParkingCsvRow changed = row("공영 변경", 1000, false, after);

        // when
        ParkingChanges updated = sync(List.of(changed), NEXT_UPLOAD_AT);
        ParkingChanges repeated = sync(List.of(changed), NEXT_UPLOAD_AT.plusSeconds(3600));

        // then
        ParkingDbRow saved = repository.findAll().getFirst();
        assertThat(updated.updated()).hasSize(1);
        assertThat(saved.id()).isEqualTo(initial.id());
        assertThat(saved.lot().isPublic()).isEqualTo(after);
        assertThat(repeated.updated()).isEmpty();
        assertThat(repeated.unchangedCount()).isEqualTo(1);
        assertThat(timestamps(saved.id(), "parking_lots")).containsExactly(FIRST_UPLOAD_AT, NEXT_UPLOAD_AT);
        assertThat(timestamps(saved.id(), "parking_operations")).containsExactly(FIRST_UPLOAD_AT, FIRST_UPLOAD_AT);
    }

    @Test
    @DisplayName("V13은 기존 행과 값이 생략된 신규 행의 공영 여부를 null로 유지한다")
    void migration_preserves_unknown_is_public_and_accepts_all_three_states() throws Exception {
        // given
        String migration = new ClassPathResource("db/migration/V13__add_parking_is_public.sql")
                .getContentAsString(StandardCharsets.UTF_8);
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            connection.setAutoCommit(false);
            try {
                statement.execute("CREATE SCHEMA is_public_migration_test");
                statement.execute("SET LOCAL search_path TO is_public_migration_test");
                statement.execute("CREATE TABLE parking_lots (id INTEGER PRIMARY KEY)");
                statement.execute("INSERT INTO parking_lots VALUES (1), (2)");

                // when
                statement.execute(migration);
                statement.execute("INSERT INTO parking_lots (id) VALUES (3)");
                statement.execute("INSERT INTO parking_lots VALUES (4, TRUE), (5, FALSE), (6, NULL)");

                // then
                try (ResultSet rows = statement.executeQuery("SELECT is_public FROM parking_lots ORDER BY id")) {
                    List<Boolean> flags = new ArrayList<>();
                    while (rows.next()) {
                        flags.add(rows.getObject("is_public", Boolean.class));
                    }
                    assertThat(flags).containsExactly(null, null, null, true, false, null);
                }
            } finally {
                connection.rollback();
            }
        }
    }

    @Test
    @DisplayName("임시 적재 배치의 모든 필드와 null, 소수초를 행별로 구분하여 보존한다")
    void stages_distinct_nullable_values_without_reusing_previous_row_parameters() {
        // given
        List<ParkingCsvRow> rows = bindingRows();
        repository.createStaging();

        // when
        repository.stageRows(rows);
        List<ParkingCsvRow> staged = readStagedRows();

        // then
        assertThat(staged).containsExactlyElementsOf(rows);
        assertThat(jdbcTemplate.queryForList(
                "SELECT id FROM parking_csv_staging ORDER BY row_number", Long.class
        )).containsExactly(2L, 7L, 11L);
        assertThat(jdbcTemplate.queryForList(
                "SELECT operation_id FROM parking_csv_staging ORDER BY row_number", Long.class
        )).containsExactly(2L, 7L, 11L);
    }

    @ParameterizedTest(name = "원본 시각: {0}, 운영 시각: {1}")
    @MethodSource("temporalBindingCases")
    @DisplayName("임시 적재 시각의 지원 범위와 반올림 결과가 기존 JDBC 바인딩과 같다")
    void stages_temporal_boundaries_with_jdbc_rounding(Instant sourceTime, LocalTime scheduleTime) {
        // given
        TemporalValues expected = jdbcTemplate.query("SELECT ?::timestamptz AS source_time, ?::time AS schedule_time",
                statement -> {
                    statement.setObject(1, sourceTime.atOffset(ZoneOffset.UTC), Types.TIMESTAMP_WITH_TIMEZONE);
                    statement.setObject(2, scheduleTime, Types.TIME);
                }, resultSet -> {
                    resultSet.next();
                    return new TemporalValues(
                            resultSet.getObject("source_time", OffsetDateTime.class).toInstant(),
                            resultSet.getObject("schedule_time", LocalTime.class),
                            resultSet.getString("schedule_time")
                    );
                });
        ParkingCsvRow base = row("시각 경계값", 1000);
        ParkingLotValues old = base.lot();
        ParkingLotValues lot = new ParkingLotValues(
                old.source(), old.sourceExternalId(), old.name(), old.sido(), old.sigungu(), old.address(),
                old.latitude(), old.longitude(), old.capacity(), old.mechanical(), old.isPublic(), old.active(), sourceTime
        );
        ParkingScheduleValues schedule = new ParkingScheduleValues(ParkingOperationStatus.OPEN, scheduleTime, scheduleTime);
        ParkingOperationValues operation = new ParkingOperationValues(
                null, null, null, null, null, null, null, null, null, null,
                schedule, schedule, schedule, sourceTime
        );
        repository.createStaging();

        // when
        repository.stageRows(List.of(new ParkingCsvRow(2, lot, operation)));
        ParkingCsvRow saved = readStagedRows().getFirst();

        // then
        assertThat(saved.lot().sourceCheckedAt()).isEqualTo(expected.sourceTime());
        assertThat(saved.operation().sourceCheckedAt()).isEqualTo(expected.sourceTime());
        ParkingScheduleValues expectedSchedule = new ParkingScheduleValues(
                ParkingOperationStatus.OPEN, expected.scheduleTime(), expected.scheduleTime()
        );
        assertThat(saved.operation().weekday()).isEqualTo(expectedSchedule);
        assertThat(saved.operation().weekend()).isEqualTo(expectedSchedule);
        assertThat(saved.operation().holiday()).isEqualTo(expectedSchedule);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT weekday_open_time::text FROM parking_csv_staging", String.class
        )).isEqualTo(expected.scheduleText());
    }

    @Test
    @DisplayName("바이너리 식별키의 null, NUL, UTF-8을 보존하고 처음 등장한 키 순서로 중복을 반환한다")
    void stages_binary_keys_without_losing_null_or_utf8_values_and_duplicate_order() {
        // given
        ParkingKey nulKey = new ParkingKey("한글\u0000주차장", "주소😀");
        ParkingKey nullName = new ParkingKey(null, "주소만 있음");
        ParkingKey nullAddress = new ParkingKey("이름만 있음", null);
        ParkingKey bothNull = new ParkingKey(null, null);
        List<ParkingCsvKey> keys = List.of(
                new ParkingCsvKey(2, nulKey),
                new ParkingCsvKey(3, nullName),
                new ParkingCsvKey(4, nullAddress),
                new ParkingCsvKey(5, bothNull),
                new ParkingCsvKey(6, new ParkingKey("다른 주차장", "다른 주소")),
                new ParkingCsvKey(7, nullName),
                new ParkingCsvKey(8, nulKey),
                new ParkingCsvKey(9, nullAddress),
                new ParkingCsvKey(10, bothNull)
        );
        repository.createStaging();

        // when
        repository.stageKeys(keys);
        List<Long> duplicates = repository.findDuplicateRowNumbers();

        // then
        assertThat(duplicates).containsExactly(2L, 8L, 3L, 7L, 4L, 9L, 5L, 10L);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT name FROM parking_csv_keys WHERE row_number = 2", byte[].class
        )).isEqualTo(nulKey.name().getBytes(StandardCharsets.UTF_8));
        assertThat(jdbcTemplate.queryForObject(
                "SELECT address FROM parking_csv_keys WHERE row_number = 2", byte[].class
        )).isEqualTo(nulKey.address().getBytes(StandardCharsets.UTF_8));
        assertThat(jdbcTemplate.queryForObject(
                "SELECT name IS NULL AND address IS NULL FROM parking_csv_keys WHERE row_number = 5", Boolean.class
        )).isTrue();
    }

    @Test
    @DisplayName("정상 행과 검증 실패 행의 키를 함께 비교하고 같은 행을 두 번 세지 않는다")
    void detects_duplicates_across_staged_rows_and_invalid_keys() {
        // given
        ParkingCsvRow first = row("정상 중복", 1000);
        ParkingCsvRow mixed = row("검증 실패와 중복", 2000);
        ParkingCsvRow unique = row("중복 없는 행", 3000);
        List<ParkingCsvRow> rows = List.of(
                first,
                new ParkingCsvRow(4, mixed.lot(), mixed.operation()),
                new ParkingCsvRow(8, first.lot(), first.operation()),
                new ParkingCsvRow(11, unique.lot(), unique.operation())
        );
        List<ParkingCsvKey> keys = List.of(
                new ParkingCsvKey(3, new ParkingKey("NUL\0오류", "주소")),
                new ParkingCsvKey(5, mixed.key()),
                new ParkingCsvKey(7, new ParkingKey("NUL\0오류", "주소")),
                new ParkingCsvKey(11, unique.key())
        );
        repository.createStaging();

        // when
        repository.stageRows(rows);
        repository.stageKeys(keys);
        List<Long> duplicates = repository.findDuplicateRowNumbers();

        // then
        assertThat(duplicates).containsExactly(2L, 8L, 3L, 7L, 4L, 5L);
    }

    @Test
    @DisplayName("큰 식별키와 UTF-8 경계 문자를 기존 문자열 인코딩과 동일한 바이트로 저장한다")
    void stages_long_keys_and_surrogate_boundaries_with_standard_utf8_encoding() {
        // given
        List<String> values = List.of(
                "",
                "ASCII".repeat(205),
                "한".repeat(1024),
                "한".repeat(1023) + "😀끝",
                "😀".repeat(1024),
                "문자😀\u0000".repeat(4096),
                "\uD800",
                "\uDC00",
                "\uD800\uD800A\uDC00",
                "A".repeat(1023) + "\uD800끝",
                "A".repeat(1023) + "😀",
                "A".repeat(1024) + "\uDC00",
                "마지막 값"
        );
        List<ParkingCsvKey> keys = new ArrayList<>();
        for (int index = 0; index < values.size(); index++) {
            keys.add(new ParkingCsvKey(index + 2, new ParkingKey(
                    values.get(index), values.get(values.size() - index - 1)
            )));
        }
        repository.createStaging();

        // when
        repository.stageKeys(keys);
        List<byte[]> names = jdbcTemplate.queryForList(
                "SELECT name FROM parking_csv_keys ORDER BY row_number", byte[].class
        );
        List<byte[]> addresses = jdbcTemplate.queryForList(
                "SELECT address FROM parking_csv_keys ORDER BY row_number", byte[].class
        );

        // then
        assertThat(names).hasSize(values.size());
        assertThat(addresses).hasSize(values.size());
        for (int index = 0; index < values.size(); index++) {
            assertThat(names.get(index)).isEqualTo(utf8OrNull(keys.get(index).key().name()));
            assertThat(addresses.get(index)).isEqualTo(utf8OrNull(keys.get(index).key().address()));
        }
    }

    private ParkingChanges sync(List<ParkingCsvRow> rows, Instant now) {
        ParkingChanges changes = differ.compare(repository.findAll(), rows);
        repository.save(changes, now);
        return changes;
    }

    private ParkingCsvRow row(String name, int fee) {
        return row(name, fee, false);
    }

    private ParkingCsvRow row(String name, int fee, boolean mechanical) {
        return row(name, fee, mechanical, null);
    }

    private ParkingCsvRow row(String name, int fee, boolean mechanical, Boolean isPublic) {
        ParkingLotValues lot = new ParkingLotValues(
                ParkingDataSource.DATA_GO_KR, "shared-source-id", name, "서울특별시", "강남구",
                "서울시 테스트 주소", 37.4981, 127.0279, 100, mechanical, isPublic, true, SOURCE_CHECKED_AT
        );
        ParkingScheduleValues schedule = new ParkingScheduleValues(
                ParkingOperationStatus.OPEN, LocalTime.of(9, 0), LocalTime.of(18, 0)
        );
        ParkingOperationValues operation = new ParkingOperationValues(
                0, 30, fee, 10, 500, null, null,
                true, null, false, schedule, schedule, schedule, SOURCE_CHECKED_AT
        );
        return new ParkingCsvRow(2, lot, operation);
    }

    private ParkingDbRow findByName(String name) {
        return repository.findAll()
                .stream()
                .filter(row -> row.lot().name().equals(name))
                .findFirst()
                .orElseThrow();
    }

    private List<Instant> timestamps(long id, String table) {
        String idColumn = "id";
        if (table.equals("parking_operations")) {
            idColumn = "parking_lot_id";
        }
        return jdbcTemplate.queryForObject(
                "SELECT created_at, updated_at FROM " + table + " WHERE " + idColumn + " = ?",
                (resultSet, rowNumber) -> List.of(
                        resultSet.getObject("created_at", OffsetDateTime.class).toInstant(),
                        resultSet.getObject("updated_at", OffsetDateTime.class).toInstant()
                ),
                id
        );
    }

    private TransactionTemplate newTransaction() {
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        return template;
    }

    private static Stream<Arguments> temporalBindingCases() {
        return Stream.of(
                Arguments.of(Instant.parse("1999-12-31T23:59:59.999999499Z"), LocalTime.of(23, 59, 59, 999999499)),
                Arguments.of(Instant.parse("1999-12-31T23:59:59.999999500Z"), LocalTime.of(23, 59, 59, 999999500)),
                Arguments.of(Instant.parse("1969-12-31T23:59:59.123456499Z"), LocalTime.of(9, 0, 0, 123456499)),
                Arguments.of(Instant.parse("1969-12-31T23:59:59.123456500Z"), LocalTime.of(9, 0, 0, 123456500)),
                Arguments.of(Instant.parse("-4712-01-01T00:00:00Z"), LocalTime.MIDNIGHT),
                Arguments.of(Instant.parse("+294276-12-31T23:59:59.999999Z"), LocalTime.MAX)
        );
    }

    private List<ParkingCsvRow> bindingRows() {
        ParkingCsvRow populated = new ParkingCsvRow(2, new ParkingLotValues(
                ParkingDataSource.SEOUL_PARKING_SITE, "binding-full", "바인딩 전체 값", "부산광역시", "해운대구",
                "서울시 테스트 주소", 35.1631, 129.1635, 321, true, true, true,
                SOURCE_CHECKED_AT.plusNanos(111111000)
        ), new ParkingOperationValues(
                11, 22, 3300, 44, 5500, 66000, 77000, true, false, true,
                new ParkingScheduleValues(
                        ParkingOperationStatus.OPEN, LocalTime.of(8, 1, 2, 123456000), LocalTime.of(21, 3, 4, 234567000)
                ),
                new ParkingScheduleValues(
                        ParkingOperationStatus.CLOSED, LocalTime.of(9, 5, 6, 345678000), LocalTime.of(20, 7, 8, 456789000)
                ),
                new ParkingScheduleValues(
                        ParkingOperationStatus.UNKNOWN, LocalTime.of(10, 9, 10, 567890000), LocalTime.of(19, 11, 12, 678901000)
                ),
                SOURCE_CHECKED_AT.plusSeconds(1).plusNanos(222222000)
        ));
        ParkingScheduleValues emptySchedule = new ParkingScheduleValues(null, null, null);
        ParkingCsvRow cleared = new ParkingCsvRow(7, new ParkingLotValues(
                ParkingDataSource.DATA_GO_KR, "binding-empty", "바인딩 선택값 없음", null, null,
                "서울시 테스트 주소", null, null, null, false, null, false,
                SOURCE_CHECKED_AT.plusSeconds(2).plusNanos(333333000)
        ), new ParkingOperationValues(
                null, null, null, null, null, null, null, null, null, null,
                emptySchedule, emptySchedule, emptySchedule,
                SOURCE_CHECKED_AT.plusSeconds(3).plusNanos(444444000)
        ));
        ParkingCsvRow partial = new ParkingCsvRow(11, new ParkingLotValues(
                ParkingDataSource.SEOUL_PARKING_SITE, "binding-partial", "바인딩 부분 값", "인천광역시", null,
                "서울시 테스트 주소", 37.4563, 126.7052, 654, false, false, true,
                SOURCE_CHECKED_AT.plusSeconds(4).plusNanos(555555000)
        ), new ParkingOperationValues(
                9, null, 8800, null, 6600, null, 44000, false, true, null,
                new ParkingScheduleValues(ParkingOperationStatus.OPEN, null, LocalTime.of(18, 0, 0, 789012000)),
                new ParkingScheduleValues(null, LocalTime.of(7, 0, 0, 890123000), null),
                new ParkingScheduleValues(ParkingOperationStatus.UNKNOWN, null, null),
                SOURCE_CHECKED_AT.plusSeconds(5).plusNanos(666666000)
        ));
        return List.of(populated, cleared, partial);
    }

    private List<ParkingCsvRow> readStagedRows() {
        return jdbcTemplate.query("SELECT * FROM parking_csv_staging ORDER BY row_number", (resultSet, rowNumber) ->
                new ParkingCsvRow(resultSet.getLong("row_number"), new ParkingLotValues(
                        ParkingDataSource.valueOf(resultSet.getString("source")),
                        resultSet.getString("source_external_id"), resultSet.getString("name"),
                        resultSet.getString("sido"), resultSet.getString("sigungu"), resultSet.getString("address"),
                        resultSet.getObject("latitude", Double.class), resultSet.getObject("longitude", Double.class),
                        resultSet.getObject("capacity", Integer.class), resultSet.getBoolean("mechanical"),
                        resultSet.getObject("is_public", Boolean.class), resultSet.getBoolean("active"),
                        resultSet.getObject("lot_source_checked_at", OffsetDateTime.class).toInstant()
                ), new ParkingOperationValues(
                        resultSet.getObject("base_free_minutes", Integer.class),
                        resultSet.getObject("base_minutes", Integer.class), resultSet.getObject("base_fee", Integer.class),
                        resultSet.getObject("additional_minutes", Integer.class),
                        resultSet.getObject("additional_fee", Integer.class),
                        resultSet.getObject("daily_max_fee", Integer.class), resultSet.getObject("monthly_fee", Integer.class),
                        resultSet.getObject("weekday_paid", Boolean.class), resultSet.getObject("saturday_paid", Boolean.class),
                        resultSet.getObject("holiday_paid", Boolean.class),
                        readStagedSchedule(resultSet, "weekday"), readStagedSchedule(resultSet, "weekend"),
                        readStagedSchedule(resultSet, "holiday"),
                        resultSet.getObject("operation_source_checked_at", OffsetDateTime.class).toInstant()
                ))
        );
    }

    private ParkingScheduleValues readStagedSchedule(ResultSet resultSet, String prefix) throws SQLException {
        String status = resultSet.getString(prefix + "_status");
        ParkingOperationStatus operationStatus = null;
        if (status != null) {
            operationStatus = ParkingOperationStatus.valueOf(status);
        }
        return new ParkingScheduleValues(
                operationStatus, resultSet.getObject(prefix + "_open_time", LocalTime.class),
                resultSet.getObject(prefix + "_close_time", LocalTime.class)
        );
    }

    private byte[] utf8OrNull(String value) {
        if (value == null) {
            return null;
        }
        return value.getBytes(StandardCharsets.UTF_8);
    }

    private record TemporalValues(Instant sourceTime, LocalTime scheduleTime, String scheduleText) {
    }
}
