ALTER TABLE parking_lots ADD COLUMN viewport_grid_cell BIGINT;

CREATE INDEX idx_parking_lots_viewport_grid_cell
    ON parking_lots (viewport_grid_cell, id)
    WHERE active = TRUE
      AND location IS NOT NULL
      AND address IS NOT NULL;

CREATE TABLE parking_viewport_cache_state
(
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    grid_size_meters INTEGER NOT NULL CHECK (grid_size_meters BETWEEN 100 AND 20000),
    projection_ready BOOLEAN NOT NULL
);

INSERT INTO parking_viewport_cache_state
    (id, grid_size_meters, projection_ready)
VALUES (1, 1000, FALSE);
