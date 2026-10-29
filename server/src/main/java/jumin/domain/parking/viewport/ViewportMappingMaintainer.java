package jumin.domain.parking.viewport;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class ViewportMappingMaintainer {

    private static final int BATCH_SIZE = 500;
    private final JdbcTemplate jdbc;
    private final ViewportSquareGrid grid;

    public ViewportMappingMaintainer(JdbcTemplate jdbc, ViewportSquareGrid grid) {
        this.jdbc = jdbc;
        this.grid = grid;
    }

    public MappingResult repairAndVerify(int gridSizeMeters) {
        Long afterId = null;
        boolean changed = false;
        boolean valid = true;
        while (true) {
            List<MappingRow> rows = findBatch(afterId);
            if (rows.isEmpty()) {
                return new MappingResult(changed, valid);
            }
            List<Object[]> updates = new ArrayList<>();
            for (MappingRow row : rows) {
                boolean validCoordinates = row.latitude() != null && row.longitude() != null
                        && Double.isFinite(row.latitude()) && Double.isFinite(row.longitude())
                        && row.latitude() >= -90 && row.latitude() <= 90
                        && row.longitude() >= -180 && row.longitude() <= 180;
                Long desired = validCoordinates
                        && grid.supports(row.latitude(), row.longitude())
                        ? grid.cellId(row.latitude(), row.longitude(), gridSizeMeters) : null;
                if (validCoordinates && (row.emptyLocation() || row.locationLatitude() == null
                        || row.locationLongitude() == null
                        || row.latitude().doubleValue() != row.locationLatitude().doubleValue()
                        || row.longitude().doubleValue() != row.locationLongitude().doubleValue())) {
                    valid = false;
                }
                if (!Objects.equals(desired, row.cellId())) {
                    updates.add(new Object[]{desired, row.id(), row.latitude(), row.longitude()});
                }
            }
            if (!updates.isEmpty()) {
                int[] counts = jdbc.batchUpdate("""
                        UPDATE parking_lots SET viewport_grid_cell = ?
                        WHERE id = ? AND latitude IS NOT DISTINCT FROM ?
                          AND longitude IS NOT DISTINCT FROM ?
                        """, updates);
                for (int count : counts) {
                    if (count != 1) {
                        throw new IllegalStateException("동시 원본 변경으로 사각형 grid mapping을 검증할 수 없습니다.");
                    }
                }
                changed = true;
            }
            afterId = rows.getLast().id();
        }
    }

    private List<MappingRow> findBatch(Long afterId) {
        String condition = afterId == null ? "" : "WHERE id > ?";
        String sql = """
                SELECT id, latitude, longitude, viewport_grid_cell,
                       ST_X(location::geometry) AS location_longitude,
                       ST_Y(location::geometry) AS location_latitude,
                       COALESCE(ST_IsEmpty(location::geometry), TRUE) AS empty_location
                FROM parking_lots
                """ + condition + " ORDER BY id LIMIT " + BATCH_SIZE;
        Object[] parameters = afterId == null ? new Object[0] : new Object[]{afterId};
        return jdbc.query(sql, (rows, index) -> new MappingRow(rows.getLong("id"),
                rows.getObject("latitude", Double.class), rows.getObject("longitude", Double.class),
                rows.getObject("viewport_grid_cell", Long.class), rows.getObject("location_latitude", Double.class),
                rows.getObject("location_longitude", Double.class), rows.getBoolean("empty_location")), parameters);
    }

    public record MappingResult(boolean changed, boolean valid) {
    }

    private record MappingRow(long id, Double latitude, Double longitude, Long cellId,
                              Double locationLatitude, Double locationLongitude, boolean emptyLocation) {
    }
}
