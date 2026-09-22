CREATE TABLE walking_nodes
(
    id                 BIGINT PRIMARY KEY,
    node_type_code     VARCHAR(30),
    geom               geometry(Point, 4326) NOT NULL,
    source             VARCHAR(30) NOT NULL DEFAULT 'SEOUL',
    source_checked_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_walking_nodes_geom
    ON walking_nodes
    USING GIST (geom);

CREATE INDEX idx_walking_nodes_geom_geography
    ON walking_nodes
    USING GIST ((geom::geography));

CREATE TABLE walking_edges
(
    id                 BIGINT PRIMARY KEY,
    source             BIGINT NOT NULL,
    target             BIGINT NOT NULL,
    link_type_code     VARCHAR(30),
    geom               geometry(LineString, 4326) NOT NULL,
    cost               DOUBLE PRECISION NOT NULL,
    reverse_cost       DOUBLE PRECISION NOT NULL DEFAULT -1,
    walkable           BOOLEAN NOT NULL DEFAULT TRUE,
    source_checked_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_walking_edges_source
        FOREIGN KEY (source)
            REFERENCES walking_nodes (id),
    CONSTRAINT fk_walking_edges_target
        FOREIGN KEY (target)
            REFERENCES walking_nodes (id),
    CONSTRAINT ck_walking_edges_cost
        CHECK (cost > 0),
    CONSTRAINT ck_walking_edges_reverse_cost
        CHECK (reverse_cost > 0 OR reverse_cost = -1),
    CONSTRAINT ck_walking_edges_distinct_nodes
        CHECK (source <> target)
);

CREATE TABLE walking_network_metadata
(
    id               SMALLINT PRIMARY KEY DEFAULT 1,
    status           VARCHAR(20) NOT NULL,
    source           VARCHAR(30) NOT NULL,
    source_row_count BIGINT NOT NULL,
    node_count       BIGINT NOT NULL,
    edge_count       BIGINT NOT NULL,
    imported_at      TIMESTAMPTZ NOT NULL,

    CONSTRAINT ck_walking_network_metadata_singleton CHECK (id = 1),
    CONSTRAINT ck_walking_network_metadata_status CHECK (status IN ('READY')),
    CONSTRAINT ck_walking_network_metadata_counts CHECK (
        source_row_count > 0
        AND node_count > 0
        AND edge_count > 0
        AND source_row_count = node_count + edge_count
    )
);

CREATE INDEX idx_walking_edges_source
    ON walking_edges (source);

CREATE INDEX idx_walking_edges_target
    ON walking_edges (target);

CREATE INDEX idx_walking_edges_geom
    ON walking_edges
    USING GIST (geom);

CREATE INDEX idx_walking_edges_walkable
    ON walking_edges (walkable)
    WHERE walkable = true;
