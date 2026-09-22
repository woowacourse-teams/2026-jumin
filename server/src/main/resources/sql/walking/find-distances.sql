-- 1. 목적지 좌표를 연결 가능한 주변 보행 노드에 연결한다.
WITH destination_nodes AS (
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
),
-- 2. 각 주차장 좌표를 연결 가능한 주변 보행 노드에 연결한다.
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
    ) node
),
-- 3. 목적지·주차장 노드 조합별 최단 보행로 거리를 계산한다.
routes AS (
    SELECT destination.id AS destination_node_id,
           destination.id AS candidate_node_id,
           0::double precision AS agg_cost,
           destination.snap_distance
    FROM destination_nodes destination

    UNION ALL

    SELECT route.start_vid AS destination_node_id,
           route.end_vid AS candidate_node_id,
           route.agg_cost,
           destination.snap_distance
    FROM destination_nodes destination
    JOIN pgr_dijkstraCost(
        'SELECT id, source, target, cost, reverse_cost '
            || 'FROM walking_edges WHERE walkable = true',
        ARRAY(SELECT DISTINCT node.id FROM destination_nodes node),
        ARRAY(
            SELECT DISTINCT candidate.node_id
            FROM candidate_nodes candidate
        ),
        true
    ) route ON route.start_vid = destination.id
)
-- 4. 연결된 조합 중 총 도보거리가 가장 짧은 값을 주차장별로 반환한다.
SELECT candidate.parking_lot_id,
       ROUND(MIN((routes.agg_cost
           + routes.snap_distance
           + candidate.snap_distance))::numeric)::integer AS distance_meters
FROM candidate_nodes candidate
JOIN routes ON routes.candidate_node_id = candidate.node_id
GROUP BY candidate.parking_lot_id
