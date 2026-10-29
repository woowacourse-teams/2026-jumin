ALTER TABLE parking_lots ADD COLUMN viewport_grid_cell BIGINT;

CREATE INDEX idx_parking_lots_viewport_grid_cell
    ON parking_lots (viewport_grid_cell, id)
    WHERE active = TRUE
      AND location IS NOT NULL
      AND address IS NOT NULL;

CREATE TABLE parking_viewport_cache_state
(
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    dataset_epoch UUID NOT NULL,
    revision BIGINT NOT NULL CHECK (revision >= 0),
    grid_size_meters INTEGER NOT NULL CHECK (grid_size_meters BETWEEN 100 AND 20000),
    projection_ready BOOLEAN NOT NULL
);

INSERT INTO parking_viewport_cache_state
    (id, dataset_epoch, revision, grid_size_meters, projection_ready)
VALUES (1, gen_random_uuid(), 0, 1000, FALSE);

CREATE FUNCTION guard_viewport_source_writer()
    RETURNS TRIGGER LANGUAGE plpgsql AS
$$
DECLARE
    cache_ready BOOLEAN;
BEGIN
    SELECT projection_ready INTO cache_ready
    FROM parking_viewport_cache_state WHERE id = 1 FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'viewport cache state is missing' USING ERRCODE = '55000';
    END IF;
    IF cache_ready AND current_setting('jumin.viewport_writer_protocol', TRUE) IS DISTINCT FROM '1' THEN
        RAISE EXCEPTION 'viewport writer protocol is required while cache is ready' USING ERRCODE = '55000';
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_parking_lots_viewport_writer
    BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON parking_lots
    FOR EACH STATEMENT EXECUTE FUNCTION guard_viewport_source_writer();

CREATE TRIGGER trg_parking_operations_viewport_writer
    BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON parking_operations
    FOR EACH STATEMENT EXECUTE FUNCTION guard_viewport_source_writer();

-- A normal stats reader cannot see another backend's backend_type. Expose only a boolean,
-- rather than granting the observer access to query text or all statistics.
CREATE FUNCTION public.viewport_cache_sessions_pending(reader_name NAME, observer_name NAME)
    RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS
$$
BEGIN
    IF NOT pg_has_role(current_user, 'pg_read_all_stats', 'USAGE') THEN
        RAISE EXCEPTION 'viewport session monitor owner requires pg_read_all_stats'
            USING ERRCODE = '42501';
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM pg_catalog.pg_stat_activity
        WHERE usename = reader_name
           OR (usename = observer_name AND pid <> pg_backend_pid())
           OR (backend_type = 'client backend' AND usesysid IS NULL)
    );
END;
$$;
REVOKE ALL ON FUNCTION public.viewport_cache_sessions_pending(NAME, NAME) FROM PUBLIC;
