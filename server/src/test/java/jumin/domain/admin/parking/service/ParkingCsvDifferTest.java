package jumin.domain.admin.parking.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import jumin.domain.admin.parking.exception.ParkingCsvException;
import jumin.domain.admin.parking.model.ParkingChanges;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.domain.admin.parking.model.ParkingDbRow;
import jumin.domain.admin.parking.model.ParkingLotValues;
import jumin.domain.admin.parking.model.ParkingOperationValues;
import jumin.domain.admin.parking.model.ParkingScheduleValues;
import jumin.domain.admin.parking.model.ParkingUpdate;
import jumin.domain.parking.entity.ParkingDataSource;
import jumin.domain.parking.entity.ParkingOperationStatus;
import jumin.global.response.ValidationErrorField;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ParkingCsvDifferTest {

    private static final Instant CHECKED_AT = Instant.parse("2026-09-28T09:42:55Z");
    private static final String ADDRESS = "서울특별시 중구 세종대로 1";

    private final ParkingCsvDiffer differ = new ParkingCsvDiffer();

    @Test
    @DisplayName("A~E 비교에서 추가, 수정, 누락 비활성화, 동일 항목을 구분한다")
    void separates_added_updated_deactivated_and_unchanged_rows() {
        // given
        ParkingDbRow a = databaseRow(10, "A", 1000, true);
        ParkingDbRow b = databaseRow(20, "B", 2000, true);
        ParkingDbRow c = databaseRow(30, "C", 3000, true);
        ParkingDbRow d = databaseRow(40, "D", 4000, true);
        ParkingCsvRow changedB = csvRow(3, "B", 2500, true);
        ParkingCsvRow newE = csvRow(5, "E", 5000, true);

        // when
        ParkingChanges changes = differ.compare(
                List.of(a, b, c, d),
                List.of(csvRow(2, "A", 1000, true), changedB, csvRow(4, "D", 4000, true), newE)
        );

        // then
        assertThat(changes.added()).containsExactly(newE);
        assertThat(changes.updated()).containsExactly(new ParkingUpdate(b, changedB));
        assertThat(changes.deactivated()).containsExactly(c);
        assertThat(changes.unchangedCount()).isEqualTo(2);
        assertThat(changes.updated().getFirst().lotChanged()).isFalse();
        assertThat(changes.updated().getFirst().operationChanged()).isTrue();
    }

    @Test
    @DisplayName("기존 비활성 행의 재등장과 명시적 비활성화는 기존 ID로 수정한다")
    void retains_existing_ids_for_both_active_transitions() {
        // given
        ParkingDbRow inactive = databaseRow(10, "A", 1000, false);
        ParkingDbRow active = databaseRow(20, "B", 2000, true);
        ParkingCsvRow reactivated = csvRow(2, "A", 1500, true);
        ParkingCsvRow deactivated = csvRow(3, "B", 2500, false);

        // when
        ParkingChanges changes = differ.compare(List.of(inactive, active), List.of(reactivated, deactivated));

        // then
        assertThat(changes.updated()).containsExactly(
                new ParkingUpdate(inactive, reactivated),
                new ParkingUpdate(active, deactivated)
        );
        assertThat(changes.updated()).extracting(update -> update.before().id()).containsExactly(10L, 20L);
        assertThat(changes.added()).isEmpty();
        assertThat(changes.deactivated()).isEmpty();
        assertThat(changes.unchangedCount()).isZero();
    }

    @Test
    @DisplayName("CSV에서 누락된 행은 활성인 경우에만 비활성화한다")
    void ignores_missing_already_inactive_rows_without_a_threshold() {
        // given
        ParkingDbRow activeA = databaseRow(10, "A", 1000, true);
        ParkingDbRow inactiveB = databaseRow(20, "B", 2000, false);
        ParkingDbRow activeC = databaseRow(30, "C", 3000, true);
        ParkingCsvRow newD = csvRow(2, "D", 4000, true);

        // when
        ParkingChanges changes = differ.compare(List.of(activeA, inactiveB, activeC), List.of(newD));

        // then
        assertThat(changes.deactivated()).containsExactly(activeA, activeC);
        assertThat(changes.added()).containsExactly(newD);
        assertThat(changes.updated()).isEmpty();
        assertThat(changes.unchangedCount()).isZero();
    }

    @Test
    @DisplayName("신규 비활성 주차장도 추가 목록에 포함한다")
    void adds_new_inactive_rows() {
        // given
        ParkingCsvRow inactive = csvRow(2, "A", 1000, false);

        // when
        ParkingChanges changes = differ.compare(List.of(), List.of(inactive));

        // then
        assertThat(changes.added()).containsExactly(inactive);
        assertThat(changes.updated()).isEmpty();
        assertThat(changes.deactivated()).isEmpty();
        assertThat(changes.unchangedCount()).isZero();
    }

    @Test
    @DisplayName("이름이 바뀌면 같은 출처 ID라도 신규 추가하고 기존 활성 행을 비활성화한다")
    void treats_renamed_parking_as_added_and_missing() {
        // given
        ParkingLotValues oldLot = lot("기존 이름", ADDRESS, true, ParkingDataSource.DATA_GO_KR, "source-id", CHECKED_AT);
        ParkingLotValues newLot = lot("새 이름", ADDRESS, true, ParkingDataSource.DATA_GO_KR, "source-id", CHECKED_AT);
        ParkingDbRow before = new ParkingDbRow(10, oldLot, operation(1000, CHECKED_AT));
        ParkingCsvRow after = new ParkingCsvRow(2, newLot, operation(1000, CHECKED_AT));

        // when
        ParkingChanges changes = differ.compare(List.of(before), List.of(after));

        // then
        assertThat(changes.added()).containsExactly(after);
        assertThat(changes.deactivated()).containsExactly(before);
        assertThat(changes.updated()).isEmpty();
    }

    @Test
    @DisplayName("이름이 같아도 주소가 다르면 다른 주차장으로 구분한다")
    void treats_different_addresses_as_different_keys() {
        // given
        ParkingDbRow before = databaseRow(10, "A", 1000, true);
        ParkingCsvRow after = new ParkingCsvRow(
                2,
                lot("A", "경기도 수원시 팔달구 효원로 1", true, ParkingDataSource.DATA_GO_KR, "A", CHECKED_AT),
                operation(1000, CHECKED_AT)
        );

        // when
        ParkingChanges changes = differ.compare(List.of(before), List.of(after));

        // then
        assertThat(changes.added()).containsExactly(after);
        assertThat(changes.deactivated()).containsExactly(before);
        assertThat(changes.updated()).isEmpty();
    }

    @Test
    @DisplayName("출처와 외부 ID가 바뀌어도 이름과 주소가 같으면 기존 ID로 수정한다")
    void updates_source_metadata_without_changing_identity() {
        // given
        ParkingDbRow before = databaseRow(10, "A", 1000, true);
        ParkingCsvRow after = new ParkingCsvRow(
                2,
                lot("A", ADDRESS, true, ParkingDataSource.SEOUL_PARKING_SITE, "new-external-id", CHECKED_AT),
                operation(1000, CHECKED_AT)
        );

        // when
        ParkingChanges changes = differ.compare(List.of(before), List.of(after));

        // then
        assertThat(changes.updated()).containsExactly(new ParkingUpdate(before, after));
        assertThat(changes.updated().getFirst().lotChanged()).isTrue();
        assertThat(changes.updated().getFirst().operationChanged()).isFalse();
        assertThat(changes.added()).isEmpty();
        assertThat(changes.deactivated()).isEmpty();
    }

    @Test
    @DisplayName("선택 값의 null은 기존 값을 지우는 변경으로 구분한다")
    void keeps_optional_null_as_an_update() {
        // given
        ParkingDbRow before = databaseRow(10, "A", 1000, true);
        ParkingCsvRow after = csvRow(2, "A", null, true);

        // when
        ParkingChanges changes = differ.compare(List.of(before), List.of(after));

        // then
        assertThat(changes.updated()).containsExactly(new ParkingUpdate(before, after));
        assertThat(changes.updated().getFirst().after().operation().baseFee()).isNull();
        assertThat(changes.unchangedCount()).isZero();
    }

    @Test
    @DisplayName("운영정보 행이 없으면 기존 주차장 ID를 유지한 채 운영정보 변경으로 구분한다")
    void adds_missing_operation_as_an_update_to_existing_parking() {
        // given
        ParkingDbRow before = new ParkingDbRow(10, defaultLot("A", true), null);
        ParkingCsvRow after = csvRow(2, "A", 1000, true);

        // when
        ParkingChanges changes = differ.compare(List.of(before), List.of(after));

        // then
        assertThat(changes.updated()).containsExactly(new ParkingUpdate(before, after));
        assertThat(changes.updated().getFirst().lotChanged()).isFalse();
        assertThat(changes.updated().getFirst().operationChanged()).isTrue();
        assertThat(changes.added()).isEmpty();
        assertThat(changes.deactivated()).isEmpty();
    }

    @Test
    @DisplayName("다른 오프셋의 같은 순간과 초 표시만 다른 시간은 동일하게 비교한다")
    void compares_instant_and_time_values_instead_of_input_formats() {
        // given
        Instant csvCheckedAt = OffsetDateTime.parse("2026-09-28T18:42:55+09:00").toInstant();
        ParkingDbRow before = databaseRow(10, "A", 1000, true);
        ParkingScheduleValues csvSchedule = new ParkingScheduleValues(
                ParkingOperationStatus.OPEN, LocalTime.parse("09:00:00"), LocalTime.parse("18:00:00")
        );
        ParkingOperationValues csvOperation = operation(1000, csvCheckedAt, csvSchedule);
        ParkingCsvRow after = new ParkingCsvRow(
                2,
                lot("A", ADDRESS, true, ParkingDataSource.DATA_GO_KR, "A", csvCheckedAt),
                csvOperation
        );

        // when
        ParkingChanges changes = differ.compare(List.of(before), List.of(after));

        // then
        assertThat(changes.unchangedCount()).isOne();
        assertThat(changes.added()).isEmpty();
        assertThat(changes.updated()).isEmpty();
        assertThat(changes.deactivated()).isEmpty();
    }

    @Test
    @DisplayName("두 테이블의 원본 확인 시각은 각각 변경 대상으로 비교한다")
    void detects_each_tables_source_checked_at_change() {
        // given
        ParkingDbRow lotBefore = databaseRow(10, "A", 1000, true);
        ParkingDbRow operationBefore = databaseRow(20, "B", 2000, true);
        Instant later = CHECKED_AT.plusSeconds(1);
        ParkingCsvRow lotAfter = new ParkingCsvRow(
                2, lot("A", ADDRESS, true, ParkingDataSource.DATA_GO_KR, "A", later), operation(1000, CHECKED_AT)
        );
        ParkingCsvRow operationAfter = new ParkingCsvRow(3, defaultLot("B", true), operation(2000, later));

        // when
        ParkingChanges changes = differ.compare(List.of(lotBefore, operationBefore), List.of(lotAfter, operationAfter));

        // then
        assertThat(changes.updated()).containsExactly(
                new ParkingUpdate(lotBefore, lotAfter), new ParkingUpdate(operationBefore, operationAfter)
        );
        assertThat(changes.updated().getFirst().lotChanged()).isTrue();
        assertThat(changes.updated().getFirst().operationChanged()).isFalse();
        assertThat(changes.updated().getLast().lotChanged()).isFalse();
        assertThat(changes.updated().getLast().operationChanged()).isTrue();
    }

    @Test
    @DisplayName("비교가 입력 목록을 변경하지 않으며 반복 호출 결과도 같다")
    void does_not_modify_input_lists() {
        // given
        List<ParkingDbRow> databaseRows = new ArrayList<>(List.of(
                databaseRow(10, "A", 1000, true), databaseRow(20, "B", 2000, true)
        ));
        List<ParkingCsvRow> csvRows = new ArrayList<>(List.of(
                csvRow(2, "A", 1000, true), csvRow(3, "C", 3000, true)
        ));
        List<ParkingDbRow> originalDatabaseRows = List.copyOf(databaseRows);
        List<ParkingCsvRow> originalCsvRows = List.copyOf(csvRows);

        // when
        ParkingChanges first = differ.compare(databaseRows, csvRows);
        ParkingChanges second = differ.compare(databaseRows, csvRows);

        // then
        assertThat(databaseRows).containsExactlyElementsOf(originalDatabaseRows);
        assertThat(csvRows).containsExactlyElementsOf(originalCsvRows);
        assertThat(second).isEqualTo(first);
        assertThat(first.unchangedCount()).isOne();
    }

    @Test
    @DisplayName("CSV의 모든 중복 행을 422 오류로 반환한다")
    void reports_all_duplicate_csv_rows_without_overwriting_them() {
        // given
        List<ParkingCsvRow> csvRows = List.of(
                csvRow(2, "A", 1000, true),
                csvRow(3, "B", 2000, true),
                csvRow(4, "A", 1500, true),
                csvRow(5, "C", 3000, true),
                csvRow(6, "B", 2500, false),
                csvRow(7, "A", 1000, true)
        );

        // when & then
        assertThatThrownBy(() -> differ.compare(List.of(), csvRows))
                .isInstanceOfSatisfying(ParkingCsvException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
                    assertThat(exception.getErrors()).extracting(ValidationErrorField::getField).containsExactly(
                            "rows[2].parking_lots.name",
                            "rows[3].parking_lots.name",
                            "rows[4].parking_lots.name",
                            "rows[6].parking_lots.name",
                            "rows[7].parking_lots.name"
                    );
                });
    }

    @Test
    @DisplayName("앞뒤 공백 제거 후 같은 CSV 키도 중복으로 거부한다")
    void rejects_csv_duplicates_after_key_normalization() {
        // given
        ParkingCsvRow first = csvRow(2, "A", 1000, true);
        ParkingCsvRow second = new ParkingCsvRow(
                3,
                lot(" A ", " " + ADDRESS + " ", true, ParkingDataSource.DATA_GO_KR, "different", CHECKED_AT),
                operation(2000, CHECKED_AT)
        );

        // when & then
        assertThatThrownBy(() -> differ.compare(List.of(), List.of(first, second)))
                .isInstanceOfSatisfying(ParkingCsvException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
                    assertThat(exception.getErrors()).hasSize(2);
                });
    }

    @Test
    @DisplayName("DB의 이름과 주소가 중복되면 기존 행을 덮어쓰지 않고 409로 중단한다")
    void rejects_duplicate_database_keys() {
        // given
        ParkingDbRow first = databaseRow(10, "A", 1000, true);
        ParkingDbRow second = databaseRow(20, "A", 2000, false);

        // when & then
        assertThatThrownBy(() -> differ.compare(List.of(first, second), List.of(csvRow(2, "A", 1000, true))))
                .isInstanceOfSatisfying(ParkingCsvException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(exception.getErrors()).isEmpty();
                });
    }

    private ParkingDbRow databaseRow(long id, String name, Integer fee, boolean active) {
        return new ParkingDbRow(id, defaultLot(name, active), operation(fee, CHECKED_AT));
    }

    private ParkingCsvRow csvRow(long rowNumber, String name, Integer fee, boolean active) {
        return new ParkingCsvRow(rowNumber, defaultLot(name, active), operation(fee, CHECKED_AT));
    }

    private ParkingLotValues defaultLot(String name, boolean active) {
        return lot(name, ADDRESS, active, ParkingDataSource.DATA_GO_KR, name, CHECKED_AT);
    }

    private ParkingLotValues lot(String name, String address, boolean active, ParkingDataSource source,
                                 String sourceExternalId, Instant checkedAt) {
        return new ParkingLotValues(
                source, sourceExternalId, name, "서울특별시", "중구", address,
                37.5, 127.0, 100, active, checkedAt
        );
    }

    private ParkingOperationValues operation(Integer fee, Instant checkedAt) {
        ParkingScheduleValues schedule = new ParkingScheduleValues(
                ParkingOperationStatus.OPEN, LocalTime.parse("09:00"), LocalTime.parse("18:00")
        );
        return operation(fee, checkedAt, schedule);
    }

    private ParkingOperationValues operation(Integer fee, Instant checkedAt, ParkingScheduleValues schedule) {
        return new ParkingOperationValues(
                0, 30, fee, 10, 500, 10000, 100000,
                true, true, false, schedule, schedule, schedule, checkedAt
        );
    }
}
