WITH candidate_cache_status AS MATERIALIZED (
    SELECT COALESCE(
        (
            SELECT metadata.candidate_nodes_snap_radius_meters >= :maxSnapDistanceMeters
            FROM walking_network_metadata metadata
            WHERE metadata.id = 1
        ),
        false
    ) AS available
),
candidate_nodes AS (
    SELECT parking_lot.id AS parking_lot_id,
           mapping.walking_node_id AS node_id,
           mapping.snap_distance
    FROM candidate_cache_status cache_status
    CROSS JOIN parking_lots parking_lot
    JOIN parking_lot_walking_nodes mapping
      ON mapping.parking_lot_id = parking_lot.id
    WHERE cache_status.available
      AND parking_lot.id IN (:parkingLotIds)
      AND mapping.snap_distance <= :maxSnapDistanceMeters

    UNION ALL

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
    ) node
    CROSS JOIN candidate_cache_status cache_status
    WHERE NOT cache_status.available
),
routes AS (
    SELECT route.end_vid AS candidate_node_id,
           route.agg_cost
    FROM pgr_dijkstraCost(
        format(
            'WITH destination_nodes AS (
                SELECT node.id,
                       ST_Distance(
                           node.geom::geography,
                           ST_SetSRID(ST_MakePoint(%1$L, %2$L), 4326)::geography
                       ) AS snap_distance
                FROM walking_nodes node
                WHERE ST_DWithin(
                    node.geom::geography,
                    ST_SetSRID(ST_MakePoint(%1$L, %2$L), 4326)::geography,
                    %3$L::double precision
                )
                  AND EXISTS (
                      SELECT 1
                      FROM walking_edges edge
                      WHERE edge.walkable = true
                        AND (edge.source = node.id OR edge.target = node.id)
                  )
            )
            SELECT id,
                   target AS source,
                   source AS target,
                   cost,
                   reverse_cost
            FROM walking_edges
            WHERE walkable = true
              AND geom && ST_Expand(
                    ST_SetSRID(ST_MakePoint(%1$L, %2$L), 4326),
                    %4$L::double precision / 75000.0
              )
              AND ST_DWithin(
                    geom::geography,
                    ST_SetSRID(ST_MakePoint(%1$L, %2$L), 4326)::geography,
                    %4$L::double precision
              )

            UNION ALL

            SELECT -(ROW_NUMBER() OVER (ORDER BY destination.id))::bigint AS id,
                   0::bigint AS source,
                   destination.id AS target,
                   destination.snap_distance AS cost,
                   -1::double precision AS reverse_cost
            FROM destination_nodes destination',
            CAST(:longitude AS double precision),
            CAST(:latitude AS double precision),
            CAST(:maxSnapDistanceMeters AS double precision),
            CAST(:graphSearchRadiusMeters AS double precision)
        ),
        0::bigint,
        ARRAY(
            SELECT DISTINCT candidate.node_id
            FROM candidate_nodes candidate
        ),
        true
    ) route
)
SELECT candidate.parking_lot_id,
       ROUND(MIN((routes.agg_cost + candidate.snap_distance))::numeric)::integer AS distance_meters
FROM candidate_nodes candidate
JOIN routes ON routes.candidate_node_id = candidate.node_id
GROUP BY candidate.parking_lot_id
