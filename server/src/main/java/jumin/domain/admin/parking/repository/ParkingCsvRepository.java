package jumin.domain.admin.parking.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;
import jumin.domain.admin.parking.model.ParkingChanges;
import jumin.domain.admin.parking.model.ParkingCsvRow;
import jumin.domain.admin.parking.model.ParkingDbRow;
import jumin.domain.admin.parking.model.ParkingKey;
import jumin.domain.admin.parking.model.ParkingLotValues;
import jumin.domain.admin.parking.model.ParkingOperationValues;
import jumin.domain.admin.parking.model.ParkingScheduleValues;
import jumin.domain.admin.parking.model.ParkingUpdate;
import jumin.domain.parking.entity.ParkingDataSource;
import jumin.domain.parking.entity.ParkingOperationStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Repository
@RequiredArgsConstructor
public class ParkingCsvRepository {

    private static final int BATCH_SIZE = 500;
    private static final long IMPORT_LOCK_KEY = 138_2026_0928L;
    private static final List<String> LOT_COLUMNS = List.of(
            "source", "source_external_id", "name", "sido", "sigungu", "address",
            "latitude", "longitude", "capacity", "active", "source_checked_at", "created_at", "updated_at"
    );
    private static final List<String> OPERATION_COLUMNS = List.of(
            "parking_lot_id", "base_free_minutes", "base_minutes", "base_fee", "additional_minutes",
            "additional_fee", "daily_max_fee", "monthly_fee", "weekday_paid", "saturday_paid", "holiday_paid",
            "weekday_status", "weekday_open_time", "weekday_close_time",
            "weekend_status", "weekend_open_time", "weekend_close_time",
            "holiday_status", "holiday_open_time", "holiday_close_time",
            "source_checked_at", "created_at", "updated_at"
    );
    private static final String SELECT_ALL = """
            SELECT l.id, l.source, l.source_external_id, l.name, l.sido, l.sigungu, l.address,
                   l.latitude, l.longitude, l.capacity, l.active, l.source_checked_at AS lot_source_checked_at,
                   o.parking_lot_id AS operation_id,
                   o.base_free_minutes, o.base_minutes, o.base_fee, o.additional_minutes, o.additional_fee,
                   o.daily_max_fee, o.monthly_fee, o.weekday_paid, o.saturday_paid, o.holiday_paid,
                   o.weekday_status, o.weekday_open_time, o.weekday_close_time,
                   o.weekend_status, o.weekend_open_time, o.weekend_close_time,
                   o.holiday_status, o.holiday_open_time, o.holiday_close_time,
                   o.source_checked_at AS operation_source_checked_at
            FROM parking_lots l
            LEFT JOIN parking_operations o ON o.parking_lot_id = l.id
            ORDER BY l.id
            """;
    private static final String UPDATE_LOT = """
            UPDATE parking_lots
            SET source = :source, source_external_id = :source_external_id, name = :name,
                sido = :sido, sigungu = :sigungu, address = :address,
                latitude = :latitude, longitude = :longitude, capacity = :capacity, active = :active,
                source_checked_at = :source_checked_at, updated_at = :updated_at
            WHERE id = :id
            """;
    private static final String UPDATE_OPERATION = """
            UPDATE parking_operations
            SET base_free_minutes = :base_free_minutes, base_minutes = :base_minutes, base_fee = :base_fee,
                additional_minutes = :additional_minutes, additional_fee = :additional_fee,
                daily_max_fee = :daily_max_fee, monthly_fee = :monthly_fee,
                weekday_paid = :weekday_paid, saturday_paid = :saturday_paid, holiday_paid = :holiday_paid,
                weekday_status = :weekday_status, weekday_open_time = :weekday_open_time,
                weekday_close_time = :weekday_close_time,
                weekend_status = :weekend_status, weekend_open_time = :weekend_open_time,
                weekend_close_time = :weekend_close_time,
                holiday_status = :holiday_status, holiday_open_time = :holiday_open_time,
                holiday_close_time = :holiday_close_time,
                source_checked_at = :source_checked_at, updated_at = :updated_at
            WHERE parking_lot_id = :parking_lot_id
            """;
    private static final String DEACTIVATE_LOT = """
            UPDATE parking_lots SET active = FALSE, updated_at = :updated_at WHERE id = :id
            """;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public boolean tryAcquireLock() {
        requireTransaction();
        Boolean locked = jdbcTemplate.queryForObject(
                "SELECT pg_try_advisory_xact_lock(:lock_key)",
                new MapSqlParameterSource("lock_key", IMPORT_LOCK_KEY),
                Boolean.class
        );
        return Boolean.TRUE.equals(locked);
    }

    public List<ParkingDbRow> findAll() {
        return jdbcTemplate.query(SELECT_ALL, new MapSqlParameterSource(), (resultSet, rowNumber) -> {
            ParkingLotValues lot = new ParkingLotValues(
                    ParkingDataSource.valueOf(ParkingKey.normalize(resultSet.getString("source"))),
                    ParkingKey.normalize(resultSet.getString("source_external_id")),
                    ParkingKey.normalize(resultSet.getString("name")),
                    ParkingKey.normalize(resultSet.getString("sido")),
                    ParkingKey.normalize(resultSet.getString("sigungu")),
                    ParkingKey.normalize(resultSet.getString("address")),
                    resultSet.getObject("latitude", Double.class),
                    resultSet.getObject("longitude", Double.class),
                    resultSet.getObject("capacity", Integer.class),
                    resultSet.getBoolean("active"),
                    readInstant(resultSet, "lot_source_checked_at")
            );
            ParkingOperationValues operation = null;
            if (resultSet.getObject("operation_id") != null) {
                operation = readOperation(resultSet);
            }
            return new ParkingDbRow(resultSet.getLong("id"), lot, operation);
        });
    }

    public void save(ParkingChanges changes, Instant now) {
        requireTransaction();
        insertNewParkingLots(changes.added(), now);
        updateExistingParkingLots(changes.updated(), now);
        deactivateMissingParkingLots(changes.deactivated(), now);
    }

    private void insertNewParkingLots(List<ParkingCsvRow> rows, Instant now) {
        for (int offset = 0; offset < rows.size(); offset += BATCH_SIZE) {
            List<ParkingCsvRow> batch = rows.subList(offset, Math.min(offset + BATCH_SIZE, rows.size()));
            List<MapSqlParameterSource> lotParameters = new ArrayList<>();
            for (ParkingCsvRow row : batch) {
                lotParameters.add(lotParameters(row.lot(), now));
            }
            MapSqlParameterSource insertParameters = new MapSqlParameterSource();
            String sql = insertSql("parking_lots", LOT_COLUMNS, lotParameters, insertParameters)
                    + " RETURNING id, name, address";
            List<GeneratedLot> generatedLots = jdbcTemplate.query(sql, insertParameters, (resultSet, rowNumber) ->
                    new GeneratedLot(
                            resultSet.getLong("id"),
                            new ParkingKey(resultSet.getString("name"), resultSet.getString("address"))
                    )
            );
            Map<ParkingKey, Long> generatedIds = new HashMap<>();
            for (GeneratedLot lot : generatedLots) {
                generatedIds.put(lot.key(), lot.id());
            }
            List<MapSqlParameterSource> operationParameters = new ArrayList<>();
            for (ParkingCsvRow row : batch) {
                Long id = generatedIds.get(row.key());
                if (id == null) {
                    throw new IllegalStateException("신규 주차장의 DB 생성 ID를 확인할 수 없습니다.");
                }
                operationParameters.add(operationParameters(id, row.operation(), now));
            }
            insertOperations(operationParameters);
        }
    }

    private void updateExistingParkingLots(List<ParkingUpdate> updates, Instant now) {
        List<MapSqlParameterSource> lotUpdates = new ArrayList<>();
        List<MapSqlParameterSource> operationUpdates = new ArrayList<>();
        List<MapSqlParameterSource> missingOperations = new ArrayList<>();
        for (ParkingUpdate update : updates) {
            long id = update.before().id();
            if (update.lotChanged()) {
                lotUpdates.add(lotParameters(update.after().lot(), now).addValue("id", id, Types.BIGINT));
            }
            if (!update.operationChanged()) {
                continue;
            }
            MapSqlParameterSource parameters = operationParameters(id, update.after().operation(), now);
            if (update.before().operation() == null) {
                missingOperations.add(parameters);
                continue;
            }
            operationUpdates.add(parameters);
        }
        batchUpdate(UPDATE_LOT, lotUpdates);
        batchUpdate(UPDATE_OPERATION, operationUpdates);
        insertOperations(missingOperations);
    }

    private void deactivateMissingParkingLots(List<ParkingDbRow> rows, Instant now) {
        List<MapSqlParameterSource> parameters = new ArrayList<>();
        for (ParkingDbRow row : rows) {
            parameters.add(new MapSqlParameterSource()
                    .addValue("id", row.id(), Types.BIGINT)
                    .addValue("updated_at", now.atOffset(ZoneOffset.UTC), Types.TIMESTAMP_WITH_TIMEZONE));
        }
        batchUpdate(DEACTIVATE_LOT, parameters);
    }

    private void insertOperations(List<MapSqlParameterSource> parameters) {
        for (int offset = 0; offset < parameters.size(); offset += BATCH_SIZE) {
            List<MapSqlParameterSource> batch = parameters.subList(
                    offset, Math.min(offset + BATCH_SIZE, parameters.size())
            );
            MapSqlParameterSource insertParameters = new MapSqlParameterSource();
            String sql = insertSql("parking_operations", OPERATION_COLUMNS, batch, insertParameters);
            int inserted = jdbcTemplate.update(sql, insertParameters);
            if (inserted != batch.size()) {
                throw new IllegalStateException("운영정보 저장 건수가 요청한 건수와 다릅니다.");
            }
        }
    }

    private void batchUpdate(String sql, List<MapSqlParameterSource> parameters) {
        for (int offset = 0; offset < parameters.size(); offset += BATCH_SIZE) {
            SqlParameterSource[] batch = parameters.subList(offset, Math.min(offset + BATCH_SIZE, parameters.size()))
                    .toArray(SqlParameterSource[]::new);
            for (int updated : jdbcTemplate.batchUpdate(sql, batch)) {
                if (updated != 1 && updated != Statement.SUCCESS_NO_INFO) {
                    throw new IllegalStateException("비교한 주차장 데이터를 갱신할 수 없습니다.");
                }
            }
        }
    }

    private String insertSql(
            String table,
            List<String> columns,
            List<MapSqlParameterSource> rows,
            MapSqlParameterSource parameters
    ) {
        StringJoiner values = new StringJoiner(", ");
        for (int rowIndex = 0; rowIndex < rows.size(); rowIndex++) {
            MapSqlParameterSource row = rows.get(rowIndex);
            StringJoiner rowValues = new StringJoiner(", ", "(", ")");
            for (String column : columns) {
                String parameter = column + "_" + rowIndex;
                rowValues.add(":" + parameter);
                parameters.addValue(parameter, row.getValue(column), row.getSqlType(column));
            }
            values.add(rowValues.toString());
        }
        // Table and column names come only from the constants above, never from CSV headers.
        return "INSERT INTO " + table + " (" + String.join(", ", columns) + ") VALUES " + values;
    }

    private MapSqlParameterSource lotParameters(ParkingLotValues lot, Instant now) {
        OffsetDateTime timestamp = now.atOffset(ZoneOffset.UTC);
        return new MapSqlParameterSource()
                .addValue("source", lot.source().name(), Types.VARCHAR)
                .addValue("source_external_id", lot.sourceExternalId(), Types.VARCHAR)
                .addValue("name", lot.name(), Types.VARCHAR)
                .addValue("sido", lot.sido(), Types.VARCHAR)
                .addValue("sigungu", lot.sigungu(), Types.VARCHAR)
                .addValue("address", lot.address(), Types.VARCHAR)
                .addValue("latitude", lot.latitude(), Types.DOUBLE)
                .addValue("longitude", lot.longitude(), Types.DOUBLE)
                .addValue("capacity", lot.capacity(), Types.INTEGER)
                .addValue("active", lot.active(), Types.BOOLEAN)
                .addValue("source_checked_at", lot.sourceCheckedAt().atOffset(ZoneOffset.UTC), Types.TIMESTAMP_WITH_TIMEZONE)
                .addValue("created_at", timestamp, Types.TIMESTAMP_WITH_TIMEZONE)
                .addValue("updated_at", timestamp, Types.TIMESTAMP_WITH_TIMEZONE);
    }

    private MapSqlParameterSource operationParameters(long id, ParkingOperationValues operation, Instant now) {
        OffsetDateTime timestamp = now.atOffset(ZoneOffset.UTC);
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("parking_lot_id", id, Types.BIGINT)
                .addValue("base_free_minutes", operation.baseFreeMinutes(), Types.INTEGER)
                .addValue("base_minutes", operation.baseMinutes(), Types.INTEGER)
                .addValue("base_fee", operation.baseFee(), Types.INTEGER)
                .addValue("additional_minutes", operation.additionalMinutes(), Types.INTEGER)
                .addValue("additional_fee", operation.additionalFee(), Types.INTEGER)
                .addValue("daily_max_fee", operation.dailyMaxFee(), Types.INTEGER)
                .addValue("monthly_fee", operation.monthlyFee(), Types.INTEGER)
                .addValue("weekday_paid", operation.weekdayPaid(), Types.BOOLEAN)
                .addValue("saturday_paid", operation.saturdayPaid(), Types.BOOLEAN)
                .addValue("holiday_paid", operation.holidayPaid(), Types.BOOLEAN)
                .addValue("source_checked_at", operation.sourceCheckedAt().atOffset(ZoneOffset.UTC), Types.TIMESTAMP_WITH_TIMEZONE)
                .addValue("created_at", timestamp, Types.TIMESTAMP_WITH_TIMEZONE)
                .addValue("updated_at", timestamp, Types.TIMESTAMP_WITH_TIMEZONE);
        addSchedule(parameters, "weekday", operation.weekday());
        addSchedule(parameters, "weekend", operation.weekend());
        addSchedule(parameters, "holiday", operation.holiday());
        return parameters;
    }

    private void addSchedule(MapSqlParameterSource parameters, String prefix, ParkingScheduleValues schedule) {
        String status = null;
        if (schedule.status() != null) {
            status = schedule.status().name();
        }
        parameters.addValue(prefix + "_status", status, Types.VARCHAR);
        parameters.addValue(prefix + "_open_time", schedule.openTime(), Types.TIME);
        parameters.addValue(prefix + "_close_time", schedule.closeTime(), Types.TIME);
    }

    private ParkingOperationValues readOperation(ResultSet resultSet) throws SQLException {
        return new ParkingOperationValues(
                resultSet.getObject("base_free_minutes", Integer.class),
                resultSet.getObject("base_minutes", Integer.class),
                resultSet.getObject("base_fee", Integer.class),
                resultSet.getObject("additional_minutes", Integer.class),
                resultSet.getObject("additional_fee", Integer.class),
                resultSet.getObject("daily_max_fee", Integer.class),
                resultSet.getObject("monthly_fee", Integer.class),
                resultSet.getObject("weekday_paid", Boolean.class),
                resultSet.getObject("saturday_paid", Boolean.class),
                resultSet.getObject("holiday_paid", Boolean.class),
                readSchedule(resultSet, "weekday"),
                readSchedule(resultSet, "weekend"),
                readSchedule(resultSet, "holiday"),
                readInstant(resultSet, "operation_source_checked_at")
        );
    }

    private ParkingScheduleValues readSchedule(ResultSet resultSet, String prefix) throws SQLException {
        String value = ParkingKey.normalize(resultSet.getString(prefix + "_status"));
        ParkingOperationStatus status = null;
        if (value != null) {
            status = ParkingOperationStatus.valueOf(value);
        }
        return new ParkingScheduleValues(
                status,
                resultSet.getObject(prefix + "_open_time", LocalTime.class),
                resultSet.getObject(prefix + "_close_time", LocalTime.class)
        );
    }

    private Instant readInstant(ResultSet resultSet, String column) throws SQLException {
        return resultSet.getObject(column, OffsetDateTime.class).toInstant();
    }

    private void requireTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("CSV 동기화 잠금과 저장은 같은 트랜잭션에서 실행해야 합니다.");
        }
    }

    private record GeneratedLot(long id, ParkingKey key) {
    }
}
