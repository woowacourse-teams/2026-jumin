CREATE EXTENSION IF NOT EXISTS postgis;
DROP EXTENSION IF EXISTS pgrouting;

CREATE ROLE jumin_viewport_read LOGIN PASSWORD 'viewport-cache-read-only'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 3;
GRANT USAGE ON SCHEMA public TO jumin_viewport_read;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO jumin_viewport_read;
ALTER ROLE jumin_viewport_read SET statement_timeout = '1s';
ALTER ROLE jumin_viewport_read SET idle_in_transaction_session_timeout = '1s';
ALTER ROLE jumin_viewport_read SET idle_session_timeout = '5s';

CREATE ROLE jumin_viewport_observer LOGIN PASSWORD 'viewport-cache-observer-only'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 1;
ALTER ROLE jumin_viewport_observer SET statement_timeout = '1s';
ALTER ROLE jumin_viewport_observer SET idle_session_timeout = '5s';
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO jumin_viewport_observer;
