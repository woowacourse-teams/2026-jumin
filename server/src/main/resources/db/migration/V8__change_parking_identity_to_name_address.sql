DO
$$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM parking_lots
        GROUP BY NULLIF(btrim(name), ''), NULLIF(btrim(address), '')
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot change parking identity: duplicate trimmed (name, address) keys exist. Resolve duplicates before applying V8.';
    END IF;
END;
$$;

-- NULL addresses from existing rows must follow the same equality rule as Map keys.
CREATE UNIQUE INDEX idx_parking_lots_name_address
    ON parking_lots (NULLIF(btrim(name), ''), NULLIF(btrim(address), '')) NULLS NOT DISTINCT;

DROP INDEX idx_parking_lots_source_external_id;
