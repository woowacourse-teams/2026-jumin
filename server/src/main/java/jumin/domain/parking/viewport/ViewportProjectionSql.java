package jumin.domain.parking.viewport;

public final class ViewportProjectionSql {

    public static final String SOURCE = """
            SELECT l.id, l.latitude, l.longitude, l.capacity, l.mechanical, l.is_public, l.active,
                   l.name IS NOT NULL AS has_name, l.address IS NOT NULL AS has_address,
                   ST_AsEWKB(l.location::geometry) AS location,
                   o.weekday_paid, o.saturday_paid, o.holiday_paid
            FROM parking_lots l
            LEFT JOIN parking_operations o ON o.parking_lot_id = l.id
            """;

    public static final String FIELDS = """
            l.id, l.latitude, l.longitude, l.capacity, l.mechanical, l.is_public,
            o.weekday_paid, o.saturday_paid, o.holiday_paid
            """;

    private ViewportProjectionSql() {
    }
}
