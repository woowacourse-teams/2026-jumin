CREATE INDEX idx_parking_lots_location_geography
    ON parking_lots
    USING GIST (location)
    WHERE active = true
      AND location IS NOT NULL;
