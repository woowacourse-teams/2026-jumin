ALTER TABLE walking_network_metadata
    ADD COLUMN candidate_nodes_snap_radius_meters INTEGER;

ALTER TABLE walking_network_metadata
    ADD CONSTRAINT ck_walking_network_candidate_snap_radius
        CHECK (candidate_nodes_snap_radius_meters IS NULL OR candidate_nodes_snap_radius_meters > 0);

CREATE TABLE parking_lot_walking_nodes
(
    parking_lot_id  BIGINT NOT NULL,
    walking_node_id BIGINT NOT NULL,
    snap_distance   DOUBLE PRECISION NOT NULL,

    CONSTRAINT fk_parking_lot_walking_nodes_parking_lot
        FOREIGN KEY (parking_lot_id)
            REFERENCES parking_lots (id)
            ON DELETE CASCADE,
    CONSTRAINT fk_parking_lot_walking_nodes_walking_node
        FOREIGN KEY (walking_node_id)
            REFERENCES walking_nodes (id)
            ON DELETE CASCADE,
    CONSTRAINT ck_parking_lot_walking_nodes_snap_distance
        CHECK (snap_distance >= 0)
);

CREATE UNIQUE INDEX idx_parking_lot_walking_nodes_lookup
    ON parking_lot_walking_nodes (parking_lot_id, walking_node_id)
    INCLUDE (snap_distance);

CREATE FUNCTION refresh_parking_lot_walking_nodes(p_parking_lot_ids BIGINT[] DEFAULT NULL)
    RETURNS BIGINT
    LANGUAGE plpgsql
AS
$$
DECLARE
    snap_radius_meters INTEGER;
    refreshed_rows     BIGINT;
BEGIN
    IF p_parking_lot_ids IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM walking_network_metadata metadata
           WHERE metadata.id = 1
             AND metadata.candidate_nodes_snap_radius_meters IS NOT NULL
       ) THEN
        RETURN 0;
    END IF;

    SELECT COALESCE(metadata.candidate_nodes_snap_radius_meters, 100)
    INTO snap_radius_meters
    FROM walking_network_metadata metadata
    WHERE metadata.id = 1;

    IF snap_radius_meters IS NULL THEN
        snap_radius_meters := 100;
    END IF;

    IF p_parking_lot_ids IS NULL THEN
        snap_radius_meters := 100;
        TRUNCATE TABLE parking_lot_walking_nodes;
    ELSE
        DELETE FROM parking_lot_walking_nodes mapping
        WHERE mapping.parking_lot_id = ANY (p_parking_lot_ids);
    END IF;

    INSERT INTO parking_lot_walking_nodes (parking_lot_id, walking_node_id, snap_distance)
    SELECT parking_lot.id,
           candidate.id,
           ST_Distance(
               candidate.geom::geography,
               ST_SetSRID(ST_MakePoint(parking_lot.longitude, parking_lot.latitude), 4326)::geography
           )
    FROM parking_lots parking_lot
    CROSS JOIN LATERAL (
        SELECT node.id, node.geom
        FROM walking_nodes node
        WHERE ST_DWithin(
            node.geom::geography,
            ST_SetSRID(ST_MakePoint(parking_lot.longitude, parking_lot.latitude), 4326)::geography,
            snap_radius_meters
        )
          AND EXISTS (
              SELECT 1
              FROM walking_edges edge
              WHERE edge.walkable = true
                AND (edge.source = node.id OR edge.target = node.id)
          )
    ) candidate
    WHERE parking_lot.latitude IS NOT NULL
      AND parking_lot.longitude IS NOT NULL
      AND (p_parking_lot_ids IS NULL OR parking_lot.id = ANY (p_parking_lot_ids));

    GET DIAGNOSTICS refreshed_rows = ROW_COUNT;

    IF p_parking_lot_ids IS NULL THEN
        UPDATE walking_network_metadata
        SET candidate_nodes_snap_radius_meters = snap_radius_meters
        WHERE id = 1;
    END IF;

    RETURN refreshed_rows;
END;
$$;
