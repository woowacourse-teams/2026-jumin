package jumin.domain.admin.parking.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import jumin.domain.admin.parking.model.ParkingDbRow;
import jumin.domain.admin.parking.model.ParkingKey;
import jumin.domain.admin.parking.model.ParkingLotValues;
import jumin.domain.admin.parking.model.ParkingOperationValues;
import jumin.domain.admin.parking.model.ParkingScheduleValues;
import jumin.domain.parking.entity.ParkingDataSource;
import jumin.domain.parking.entity.ParkingOperationStatus;
import org.springframework.jdbc.core.JdbcTemplate;

public final class ParkingCsvDatabaseTestSupport {

    private static final String SELECT_ROWS = """
            SELECT l.id, l.source, l.source_external_id, l.name, l.sido, l.sigungu, l.address,
                   l.latitude, l.longitude, l.capacity, l.mechanical, l.is_public, l.active,
                   l.source_checked_at AS lot_source_checked_at,
                   o.parking_lot_id AS operation_id,
                   o.base_free_minutes, o.base_minutes, o.base_fee, o.additional_minutes, o.additional_fee,
                   o.daily_max_fee, o.monthly_fee, o.weekday_paid, o.saturday_paid, o.holiday_paid,
                   o.weekday_status, o.weekday_open_time, o.weekday_close_time,
                   o.weekend_status, o.weekend_open_time, o.weekend_close_time,
                   o.holiday_status, o.holiday_open_time, o.holiday_close_time,
                   o.source_checked_at AS operation_source_checked_at
            FROM parking_lots l
            LEFT JOIN parking_operations o ON o.parking_lot_id = l.id
            """;

    private ParkingCsvDatabaseTestSupport() {
    }

    public static List<ParkingDbRow> findAll(JdbcTemplate jdbcTemplate) {
        return jdbcTemplate.query(SELECT_ROWS + " ORDER BY l.id", ParkingCsvDatabaseTestSupport::readRow);
    }

    private static ParkingDbRow readRow(ResultSet resultSet, int rowNumber) throws SQLException {
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
                resultSet.getBoolean("mechanical"),
                resultSet.getObject("is_public", Boolean.class),
                resultSet.getBoolean("active"),
                readInstant(resultSet, "lot_source_checked_at")
        );
        ParkingOperationValues operation = null;
        if (resultSet.getObject("operation_id") != null) {
            operation = readOperation(resultSet);
        }
        return new ParkingDbRow(resultSet.getLong("id"), lot, operation);
    }

    private static ParkingOperationValues readOperation(ResultSet resultSet) throws SQLException {
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

    private static ParkingScheduleValues readSchedule(ResultSet resultSet, String prefix) throws SQLException {
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

    private static Instant readInstant(ResultSet resultSet, String column) throws SQLException {
        return resultSet.getObject(column, OffsetDateTime.class).toInstant();
    }
}
