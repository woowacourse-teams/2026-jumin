#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "$script_dir/../.." && pwd)"
db_target="${DB_TARGET:-docker}"
db_name="${DB_NAME:-jumin}"
db_username="${DB_USERNAME:-jumin}"
compose_file="${COMPOSE_FILE:-$repo_dir/infra/docker-compose.local.yml}"
db_service="${DB_SERVICE:-postgres}"
python_bin="${OSM_PYTHON:-python3}"
readonly osm_download_base_url='https://download.geofabrik.de/asia'
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

case "$db_target" in
  docker) command -v docker >/dev/null ;;
  direct)
    command -v psql >/dev/null
    if [[ -z "${DB_PASSWORD:-}" ]]; then
      echo 'DB_TARGET=direct requires DB_PASSWORD.' >&2
      exit 1
    fi ;;
  *) echo 'DB_TARGET must be docker or direct.' >&2; exit 1 ;;
esac
command -v "$python_bin" >/dev/null

run_psql() {
  if [[ "$db_target" == direct ]]; then
    PGPASSWORD="$DB_PASSWORD" PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}" psql -X \
      --host "${DB_HOST:-127.0.0.1}" --port "${DB_PORT:-5432}" \
      --username "$db_username" --dbname "$db_name" --set ON_ERROR_STOP=1
  else
    docker compose -f "$compose_file" exec -T "$db_service" \
      sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -X --username "$1" --dbname "$2" --set ON_ERROR_STOP=1' \
      sh "$db_username" "$db_name"
  fi
}

# Fail before downloading if the target database has not been migrated.
run_psql <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgrouting')
     OR to_regclass('walking_nodes') IS NULL
     OR to_regclass('walking_edges') IS NULL
     OR to_regclass('walking_network_metadata') IS NULL THEN
    RAISE EXCEPTION 'Deploy Flyway V7 and pgRouting before importing OSM.';
  END IF;
END $$;
SQL

graph_dir="${OSM_GRAPH_DIR:-}"
if [[ -z "$graph_dir" ]]; then
  pbf_file="${OSM_PBF_FILE:-}"
  if [[ -z "$pbf_file" ]]; then
    osm_pbf_date="${OSM_PBF_DATE:-}"
    if [[ ! "$osm_pbf_date" =~ ^[0-9]{6}$ ]]; then
      echo 'OSM_PBF_DATE must be a Geofabrik snapshot date in YYMMDD format.' >&2
      exit 1
    fi
    command -v curl >/dev/null
    pbf_file="$work_dir/south-korea.osm.pbf"
    source_url="$osm_download_base_url/south-korea-$osm_pbf_date.osm.pbf"
    curl --fail --show-error --location --max-redirs 5 --retry 3 \
      --connect-timeout 20 --proto '=https' --proto-redir '=https' \
      --output "$pbf_file.part" "$source_url"
    mv "$pbf_file.part" "$pbf_file"
  else
    source_url=''
  fi
  graph_dir="$work_dir/graph"
  export_args=(export --input "$pbf_file" --output "$graph_dir")
  if [[ -n "$source_url" ]]; then export_args+=(--source-url "$source_url"); fi
  "$python_bin" "$script_dir/build-osm-walking-poc.py" "${export_args[@]}"
fi

"$python_bin" "$script_dir/build-osm-walking-poc.py" validate --directory "$graph_dir" > "$work_dir/manifest.json"
"$python_bin" - "$work_dir/manifest.json" "$work_dir/manifest.csv" <<'PY'
import csv, json, sys
with open(sys.argv[1], encoding='utf-8') as stream:
    report = json.load(stream)
with open(sys.argv[2], 'w', encoding='utf-8', newline='') as stream:
    csv.writer(stream).writerow([json.dumps(report, ensure_ascii=False, separators=(',', ':'))])
PY

{
  cat <<'SQL'
CREATE TEMP TABLE osm_nodes (id BIGINT PRIMARY KEY, lon DOUBLE PRECISION NOT NULL, lat DOUBLE PRECISION NOT NULL);
CREATE TEMP TABLE osm_edges (id BIGINT PRIMARY KEY, source BIGINT NOT NULL, target BIGINT NOT NULL,
  cost DOUBLE PRECISION NOT NULL, reverse_cost DOUBLE PRECISION NOT NULL,
  way_id BIGINT NOT NULL, segment_index INTEGER NOT NULL, wkt TEXT NOT NULL);
CREATE TEMP TABLE osm_manifest (value JSONB NOT NULL);
COPY osm_nodes FROM STDIN WITH (FORMAT csv, HEADER true);
SQL
  cat "$graph_dir/nodes.csv"
  printf '\\.\n'
  cat <<'SQL'
COPY osm_edges FROM STDIN WITH (FORMAT csv, HEADER true);
SQL
  cat "$graph_dir/edges.csv"
  printf '\\.\n'
  cat <<'SQL'
COPY osm_manifest FROM STDIN WITH (FORMAT csv);
SQL
  cat "$work_dir/manifest.csv"
  printf '\\.\n'
  cat <<'SQL'
ALTER TABLE osm_nodes ADD COLUMN geom geometry(Point, 4326);
UPDATE osm_nodes SET geom = ST_SetSRID(ST_MakePoint(lon, lat), 4326);
ALTER TABLE osm_edges ADD COLUMN geom geometry(LineString, 4326);
UPDATE osm_edges SET geom = ST_GeomFromText(wkt, 4326);

DO $$ BEGIN
  IF (SELECT COUNT(*) FROM osm_nodes) <> (SELECT (value->>'node_count')::bigint FROM osm_manifest)
     OR (SELECT COUNT(*) FROM osm_edges) <> (SELECT (value->>'edge_count')::bigint FROM osm_manifest)
     OR NOT EXISTS (SELECT 1 FROM osm_edges) THEN
    RAISE EXCEPTION 'OSM manifest counts do not match staged rows.';
  END IF;
  IF EXISTS (SELECT 1 FROM osm_nodes WHERE id <= 0 OR lon NOT BETWEEN -180 AND 180 OR lat NOT BETWEEN -90 AND 90)
     OR EXISTS (SELECT 1 FROM osm_edges e
         LEFT JOIN osm_nodes s ON s.id = e.source LEFT JOIN osm_nodes t ON t.id = e.target
         WHERE e.id <= 0 OR s.id IS NULL OR t.id IS NULL OR e.source = e.target
           OR NOT (e.cost > 0 AND e.cost < 'Infinity'::double precision)
           OR NOT ((e.reverse_cost > 0 AND e.reverse_cost < 'Infinity'::double precision) OR e.reverse_cost = -1)
           OR e.way_id <= 0 OR e.segment_index < 0 OR NOT ST_IsValid(e.geom)
           OR ST_IsEmpty(e.geom) OR ST_Length(e.geom::geography) <= 0
           OR NOT ST_Equals(ST_StartPoint(e.geom), s.geom)
           OR NOT ST_Equals(ST_EndPoint(e.geom), t.geom)) THEN
    RAISE EXCEPTION 'Invalid OSM graph references, coordinates, geometry or costs.';
  END IF;
END $$;

BEGIN;
SELECT pg_advisory_xact_lock(hashtext('walking-network-import'));
TRUNCATE TABLE walking_edges, walking_nodes;
INSERT INTO walking_nodes (id, geom, source)
SELECT id, geom, 'OSM' FROM osm_nodes;
INSERT INTO walking_edges (id, source, target, link_type_code, geom, cost, reverse_cost, walkable)
SELECT id, source, target, 'OSM', geom, cost, reverse_cost, true FROM osm_edges;
INSERT INTO walking_network_metadata (id, status, source, source_row_count, node_count, edge_count, imported_at)
SELECT 1, 'READY', 'OSM',
       (value->>'node_count')::bigint + (value->>'edge_count')::bigint,
       (value->>'node_count')::bigint, (value->>'edge_count')::bigint, CURRENT_TIMESTAMP
FROM osm_manifest
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, source = EXCLUDED.source,
  source_row_count = EXCLUDED.source_row_count, node_count = EXCLUDED.node_count,
  edge_count = EXCLUDED.edge_count, imported_at = EXCLUDED.imported_at;
COMMIT;
ANALYZE walking_nodes;
ANALYZE walking_edges;
SELECT source, node_count, edge_count FROM walking_network_metadata WHERE id = 1;
SQL
} | run_psql

echo 'OSM walking network import succeeded.'
