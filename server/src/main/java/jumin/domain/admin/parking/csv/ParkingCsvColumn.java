package jumin.domain.admin.parking.csv;

import java.util.Arrays;
import java.util.List;

public enum ParkingCsvColumn {
    LOT_ID("parking_lots.id"),
    SOURCE("parking_lots.source"),
    SOURCE_EXTERNAL_ID("parking_lots.source_external_id"),
    NAME("parking_lots.name"),
    SIDO("parking_lots.sido"),
    SIGUNGU("parking_lots.sigungu"),
    ADDRESS("parking_lots.address"),
    LATITUDE("parking_lots.latitude"),
    LONGITUDE("parking_lots.longitude"),
    CAPACITY("parking_lots.capacity"),
    ACTIVE("parking_lots.active"),
    LOT_SOURCE_CHECKED_AT("parking_lots.source_checked_at"),
    LOT_CREATED_AT("parking_lots.created_at"),
    LOT_UPDATED_AT("parking_lots.updated_at"),
    OPERATION_PARKING_LOT_ID("parking_operations.parking_lot_id"),
    BASE_FREE_MINUTES("parking_operations.base_free_minutes"),
    BASE_MINUTES("parking_operations.base_minutes"),
    BASE_FEE("parking_operations.base_fee"),
    ADDITIONAL_MINUTES("parking_operations.additional_minutes"),
    ADDITIONAL_FEE("parking_operations.additional_fee"),
    DAILY_MAX_FEE("parking_operations.daily_max_fee"),
    MONTHLY_FEE("parking_operations.monthly_fee"),
    WEEKDAY_PAID("parking_operations.weekday_paid"),
    SATURDAY_PAID("parking_operations.saturday_paid"),
    HOLIDAY_PAID("parking_operations.holiday_paid"),
    WEEKDAY_STATUS("parking_operations.weekday_status"),
    WEEKDAY_OPEN_TIME("parking_operations.weekday_open_time"),
    WEEKDAY_CLOSE_TIME("parking_operations.weekday_close_time"),
    WEEKEND_STATUS("parking_operations.weekend_status"),
    WEEKEND_OPEN_TIME("parking_operations.weekend_open_time"),
    WEEKEND_CLOSE_TIME("parking_operations.weekend_close_time"),
    HOLIDAY_STATUS("parking_operations.holiday_status"),
    HOLIDAY_OPEN_TIME("parking_operations.holiday_open_time"),
    HOLIDAY_CLOSE_TIME("parking_operations.holiday_close_time"),
    OPERATION_SOURCE_CHECKED_AT("parking_operations.source_checked_at"),
    OPERATION_CREATED_AT("parking_operations.created_at"),
    OPERATION_UPDATED_AT("parking_operations.updated_at");

    private final String header;

    ParkingCsvColumn(String header) {
        this.header = header;
    }

    public String header() {
        return header;
    }

    public static List<String> headers() {
        return Arrays.stream(values()).map(ParkingCsvColumn::header).toList();
    }
}
