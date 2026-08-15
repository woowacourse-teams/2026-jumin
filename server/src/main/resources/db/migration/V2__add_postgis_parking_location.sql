CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE parking_lots
    ADD COLUMN location geography(Point, 4326);

CREATE FUNCTION sync_parking_lot_location()
    RETURNS TRIGGER
    LANGUAGE plpgsql
AS
$$
BEGIN
    NEW.location := CASE
        WHEN NEW.latitude BETWEEN -90 AND 90
            AND NEW.longitude BETWEEN -180 AND 180
            THEN ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography
        ELSE NULL
    END;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_parking_lots_sync_location
    BEFORE INSERT OR UPDATE OF latitude, longitude
    ON parking_lots
    FOR EACH ROW
EXECUTE FUNCTION sync_parking_lot_location();

UPDATE parking_lots
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE latitude BETWEEN -90 AND 90
  AND longitude BETWEEN -180 AND 180;

CREATE INDEX idx_parking_lots_location_geography
    ON parking_lots
    USING GIST (location)
    WHERE active = true
      AND location IS NOT NULL;
