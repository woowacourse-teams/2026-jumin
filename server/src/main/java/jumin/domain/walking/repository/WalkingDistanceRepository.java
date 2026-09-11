package jumin.domain.walking.repository;

import java.util.List;
import jumin.domain.walking.dto.WalkingDistanceQueryResult;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class WalkingDistanceRepository {

    private static final String FIND_DISTANCES_SQL = """
        WITH destination_node AS (
            SELECT node.id,
                   ST_Distance(
                       node.geom::geography,
                       ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography
                   ) AS snap_distance
            FROM walking_nodes node
            WHERE ST_DWithin(
                node.geom::geography,
                ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
                :maxSnapDistanceMeters
            )
              AND EXISTS (
                  SELECT 1
                  FROM walking_edges edge
                  WHERE edge.walkable = true
                    AND (edge.source = node.id OR edge.target = node.id)
              )
            ORDER BY node.geom::geography <-> ST_SetSRID(
                ST_MakePoint(:longitude, :latitude), 4326
            )::geography
            LIMIT 1
        ),
        candidate_nodes AS (
            SELECT parking_lot.id AS parking_lot_id,
                   node.id AS node_id,
                   ST_Distance(
                       node.geom::geography,
                       ST_SetSRID(ST_MakePoint(parking_lot.longitude, parking_lot.latitude), 4326)::geography
                   ) AS snap_distance
            FROM (
                SELECT id, latitude, longitude
                FROM parking_lots
                WHERE id IN (:parkingLotIds)
                  AND latitude IS NOT NULL
                  AND longitude IS NOT NULL
            ) parking_lot
            CROSS JOIN LATERAL (
                SELECT candidate.id, candidate.geom
                FROM walking_nodes candidate
                WHERE ST_DWithin(
                    candidate.geom::geography,
                    ST_SetSRID(ST_MakePoint(parking_lot.longitude, parking_lot.latitude), 4326)::geography,
                    :maxSnapDistanceMeters
                )
                  AND EXISTS (
                      SELECT 1
                      FROM walking_edges edge
                      WHERE edge.walkable = true
                        AND (edge.source = candidate.id OR edge.target = candidate.id)
                  )
                ORDER BY candidate.geom::geography <-> ST_SetSRID(
                    ST_MakePoint(parking_lot.longitude, parking_lot.latitude), 4326
                )::geography
                LIMIT 1
            ) node
        ),
        routes AS (
            SELECT route.node,
                   route.agg_cost,
                   destination.snap_distance AS destination_snap_distance
            FROM destination_node destination
            CROSS JOIN LATERAL pgr_drivingDistance(
                'SELECT id, source, target, cost, reverse_cost '
                    || 'FROM walking_edges WHERE walkable = true',
                destination.id,
                GREATEST(:maxDistanceMeters - destination.snap_distance, 0),
                true
            ) route
        )
        SELECT candidate.parking_lot_id,
               ROUND((routes.agg_cost
                   + routes.destination_snap_distance
                   + candidate.snap_distance)::numeric)::integer AS distance_meters
        FROM candidate_nodes candidate
        JOIN routes ON routes.node = candidate.node_id
        WHERE routes.agg_cost
            + routes.destination_snap_distance
            + candidate.snap_distance <= :maxDistanceMeters
        """;

    private static final String HAS_USABLE_NETWORK_SQL = """
        SELECT EXISTS (
            SELECT 1
            FROM pg_extension
            WHERE extname = 'pgrouting'
        )
        AND EXISTS (
            SELECT 1
            FROM walking_network_metadata metadata
            WHERE metadata.id = 1
              AND metadata.status = 'READY'
              AND metadata.node_count > 0
              AND metadata.edge_count > 0
        )
        AND EXISTS (
            SELECT 1
            FROM walking_nodes
        )
        AND EXISTS (
            SELECT 1
            FROM walking_edges
            WHERE walkable = true
        )
        """;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public List<WalkingDistanceQueryResult> findDistances(
        double latitude,
        double longitude,
        List<Long> parkingLotIds,
        int maxDistanceMeters,
        int maxSnapDistanceMeters
    ) {
        MapSqlParameterSource parameters = new MapSqlParameterSource()
            .addValue("latitude", latitude)
            .addValue("longitude", longitude)
            .addValue("parkingLotIds", parkingLotIds)
            .addValue("maxDistanceMeters", maxDistanceMeters)
            .addValue("maxSnapDistanceMeters", maxSnapDistanceMeters);

        return jdbcTemplate.query(
            FIND_DISTANCES_SQL,
            parameters,
            (resultSet, rowNumber) -> new WalkingDistanceQueryResult(
                resultSet.getLong("parking_lot_id"),
                resultSet.getInt("distance_meters")
            )
        );
    }

    public boolean hasUsableNetwork() {
        Boolean result = jdbcTemplate.queryForObject(
            HAS_USABLE_NETWORK_SQL,
            new MapSqlParameterSource(),
            Boolean.class
        );
        return Boolean.TRUE.equals(result);
    }
}
