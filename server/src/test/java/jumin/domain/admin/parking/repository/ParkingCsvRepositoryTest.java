package jumin.domain.admin.parking.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Savepoint;
import java.sql.Statement;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import jumin.TestcontainersConfiguration;
import jumin.domain.admin.parking.model.ParkingChanges;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.domain.admin.parking.model.ParkingDbRow;
import jumin.domain.admin.parking.model.ParkingLotValues;
import jumin.domain.admin.parking.model.ParkingOperationValues;
import jumin.domain.admin.parking.model.ParkingScheduleValues;
import jumin.domain.admin.parking.service.ParkingCsvDiffer;
import jumin.domain.parking.entity.ParkingDataSource;
import jumin.domain.parking.entity.ParkingOperationStatus;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
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
                null, null, null, old.active(), old.sourceCheckedAt()
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

    private ParkingChanges sync(List<ParkingCsvRow> rows, Instant now) {
        ParkingChanges changes = differ.compare(repository.findAll(), rows);
        repository.save(changes, now);
        return changes;
    }

    private ParkingCsvRow row(String name, int fee) {
        ParkingLotValues lot = new ParkingLotValues(
                ParkingDataSource.DATA_GO_KR, "shared-source-id", name, "서울특별시", "강남구",
                "서울시 테스트 주소", 37.4981, 127.0279, 100, true, SOURCE_CHECKED_AT
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
}
