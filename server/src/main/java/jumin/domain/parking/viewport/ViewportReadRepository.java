package jumin.domain.parking.viewport;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import jumin.config.ViewportCacheProperties;
import jumin.domain.parking.dto.ParkingLotViewportRequest;
import jumin.domain.parking.dto.ParkingLotViewportResponse;
import jumin.domain.parking.dto.ParkingLotViewportResponses;
import jumin.domain.parking.service.ParkingLodScoreCalculator;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ViewportReadRepository {

    private static final String CELLS = """
            WITH cells AS (SELECT unnest(ARRAY[:cells]::BIGINT[]) AS cell_id)
            SELECT state.grid_size_meters, state.projection_ready,
                   cells.cell_id,
            """ + ViewportProjectionSql.FIELDS + """
            FROM parking_viewport_cache_state state
            CROSS JOIN cells
            LEFT JOIN LATERAL (
                SELECT source.* FROM parking_lots source
                WHERE source.viewport_grid_cell = cells.cell_id
                  AND source.active = TRUE AND source.location IS NOT NULL
                  AND source.name IS NOT NULL AND source.address IS NOT NULL
                ORDER BY source.id LIMIT :cell_row_limit
            ) l ON TRUE
            LEFT JOIN parking_operations o ON o.parking_lot_id = l.id
            WHERE state.id = 1
            ORDER BY cells.cell_id, l.id
            """;
    private static final String FALLBACK = "SELECT " + ViewportProjectionSql.FIELDS + """
            FROM parking_lots l LEFT JOIN parking_operations o ON o.parking_lot_id = l.id
            WHERE l.active = TRUE AND l.location IS NOT NULL
              AND l.name IS NOT NULL AND l.address IS NOT NULL
              AND l.location && ST_MakeEnvelope(:west, :south, :east, :north, 4326)::geography
              AND l.longitude BETWEEN :west AND :east AND l.latitude BETWEEN :south AND :north
              AND (:free = FALSE OR (:day BETWEEN 1 AND 5 AND o.weekday_paid = FALSE)
                   OR (:day = 6 AND o.saturday_paid = FALSE) OR (:day = 7 AND o.holiday_paid = FALSE))
              AND (:mechanical = FALSE OR l.mechanical = FALSE)
              AND (:public = FALSE OR l.is_public = TRUE)
            ORDER BY l.id LIMIT :row_limit
            """;

    private final ViewportDbAccess db;
    private final ViewportCacheProperties properties;
    private final ViewportMetrics metrics;
    private final NamedParameterJdbcTemplate named;
    private final ParkingLodScoreCalculator scores;

    public ViewportReadRepository(ViewportDbAccess db, ViewportCacheProperties properties, ViewportMetrics metrics,
                                  ParkingLodScoreCalculator scores) {
        this.db = db;
        this.properties = properties;
        this.metrics = metrics;
        this.scores = scores;
        named = new NamedParameterJdbcTemplate(db.jdbc());
    }

    public CompletableFuture<Map<ViewportCellKey, ViewportCell>> load(List<ViewportCellKey> keys,
                                                                     ViewportDeadline deadline) {
        return load(keys, deadline, () -> { });
    }

    public CompletableFuture<Map<ViewportCellKey, ViewportCell>> load(List<ViewportCellKey> keys,
                                                                     ViewportDeadline deadline,
                                                                     Runnable sourceStarted) {
        if (keys.isEmpty() || keys.size() > properties.getMaxCells()) {
            return CompletableFuture.failedFuture(new IllegalArgumentException("셀 batch 범위가 잘못되었습니다."));
        }
        int gridSizeMeters = keys.getFirst().gridSizeMeters();
        if (keys.stream().anyMatch(key -> key.gridSizeMeters() != gridSizeMeters)) {
            return CompletableFuture.failedFuture(new IllegalArgumentException("서로 다른 격자 크기는 로딩할 수 없습니다."));
        }
        MapSqlParameterSource parameters = new MapSqlParameterSource("cells", keys.stream()
                .map(ViewportCellKey::cellId).toList())
                .addValue("cell_row_limit", properties.getMaxCellRows() + 1);
        return db.readAsync("source", deadline, ignored -> {
            deadline.requireRemaining();
            sourceStarted.run();
            metrics.count("sql", "cell_batch", 1);
            return named.query(CELLS, parameters, rows -> {
                return readCells(rows, keys, gridSizeMeters, deadline);
            });
        });
    }

    private Map<ViewportCellKey, ViewportCell> readCells(ResultSet rows, List<ViewportCellKey> keys,
                                                          int gridSizeMeters, ViewportDeadline deadline)
            throws SQLException {
        Map<Long, List<ViewportItem>> items = new LinkedHashMap<>();
        keys.forEach(key -> items.put(key.cellId(), new ArrayList<>()));
        boolean sawState = false;
        long count = 0;
        while (deadline.next(rows)) {
            sawState = true;
            if (!rows.getBoolean("projection_ready") || rows.getInt("grid_size_meters") != gridSizeMeters) {
                throw ViewportFallbackException.mappingUnavailable();
            }
            if (rows.getObject("id", Long.class) == null) {
                continue;
            }
            List<ViewportItem> cell = items.get(rows.getLong("cell_id"));
            if (cell == null || cell.size() >= properties.getMaxCellRows()
                    || ++count * 160L > properties.getMaxRequestBytes()) {
                throw ViewportFallbackException.cellTooLarge();
            }
            cell.add(itemOf(rows));
        }
        if (!sawState) {
            throw ViewportFallbackException.mappingUnavailable();
        }
        Map<ViewportCellKey, ViewportCell> result = new LinkedHashMap<>();
        keys.forEach(key -> result.put(key, new ViewportCell(key, items.get(key.cellId()))));
        deadline.requireRemaining();
        return Map.copyOf(result);
    }

    public CompletableFuture<ViewportBody> fallback(ViewportBounds bounds, ParkingLotViewportRequest request, int day,
                                       ViewportDeadline deadline, Runnable sourceStarted) {
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("west", bounds.west()).addValue("south", bounds.south())
                .addValue("east", bounds.east()).addValue("north", bounds.north())
                .addValue("free", request.freeOnly()).addValue("mechanical", request.excludeMechanical())
                .addValue("public", request.isPublic()).addValue("day", day)
                .addValue("row_limit", properties.getMaxFallbackRows() + 1);
        return db.readAsync("fallback", deadline, ignored -> {
            deadline.requireRemaining();
            sourceStarted.run();
            metrics.count("sql", "fallback", 1);
            return named.query(FALLBACK, parameters, rows -> {
                return readFallback(rows, deadline);
            });
        });
    }

    private ViewportBody readFallback(ResultSet rows, ViewportDeadline deadline) throws SQLException {
        List<ParkingLotViewportResponse> response = new ArrayList<>();
        while (deadline.next(rows)) {
            if (response.size() >= properties.getMaxFallbackRows()) {
                throw ViewportFailureReason.UNCLASSIFIED.failure();
            }
            ViewportItem item = itemOf(rows);
            response.add(new ParkingLotViewportResponse(item.id(), item.latitude(), item.longitude(),
                    scores.calculate(item.capacity())));
        }
        deadline.requireRemaining();
        return new ViewportBody(ParkingLotViewportResponses.from(response));
    }

    private static ViewportItem itemOf(ResultSet rows) throws SQLException {
        return new ViewportItem(rows.getLong("id"), rows.getDouble("latitude"), rows.getDouble("longitude"),
                rows.getObject("capacity", Integer.class), rows.getObject("mechanical", Boolean.class),
                rows.getObject("is_public", Boolean.class), rows.getObject("weekday_paid", Boolean.class),
                rows.getObject("saturday_paid", Boolean.class), rows.getObject("holiday_paid", Boolean.class));
    }
}
