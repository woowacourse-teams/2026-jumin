-- 1. 목적지 좌표를 연결 가능한 가장 가까운 보행 노드에 연결한다.
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
-- 2. 각 주차장 좌표를 연결 가능한 가장 가까운 보행 노드에 연결한다.
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
-- 3. 목적지 노드에서 후보 보행 노드까지의 최단 보행로 거리를 계산한다.
routes AS (
    SELECT destination.id AS node_id,
           0::double precision AS agg_cost,
           destination.snap_distance AS destination_snap_distance
    FROM destination_node destination

    UNION ALL

    SELECT route.end_vid AS node_id,
           route.agg_cost,
           destination.snap_distance AS destination_snap_distance
    FROM destination_node destination
    CROSS JOIN LATERAL pgr_dijkstraCost(
        'SELECT id, source, target, cost, reverse_cost '
            || 'FROM walking_edges WHERE walkable = true',
        destination.id,
        ARRAY(
            SELECT DISTINCT candidate.node_id
            FROM candidate_nodes candidate
            WHERE candidate.node_id <> destination.id
        ),
        true
    ) route
)
-- 4. 보행로 거리와 양 끝의 연결 거리를 합산해 도보거리를 반환한다.
SELECT candidate.parking_lot_id,
       ROUND((routes.agg_cost
           + routes.destination_snap_distance
           + candidate.snap_distance)::numeric)::integer AS distance_meters
FROM candidate_nodes candidate
JOIN routes ON routes.node_id = candidate.node_id
