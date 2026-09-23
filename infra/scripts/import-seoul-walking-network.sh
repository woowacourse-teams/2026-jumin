#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${SEOUL_OPEN_DATA_API_KEY:-}" ]]; then
  echo "SEOUL_OPEN_DATA_API_KEY 환경변수가 필요합니다." >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
compose_file="${COMPOSE_FILE:-$project_dir/docker-compose.local.yml}"
db_service="${DB_SERVICE:-postgres}"
db_name="${DB_NAME:-jumin}"
db_username="${DB_USERNAME:-jumin}"
db_target="${DB_TARGET:-docker}"
db_host="${DB_HOST:-127.0.0.1}"
db_port="${DB_PORT:-5432}"
api_base_url="${SEOUL_OPEN_DATA_API_BASE_URL:-http://openapi.seoul.go.kr:8088}"
page_size="${SEOUL_OPEN_DATA_PAGE_SIZE:-1000}"
seoul_open_data_sgg_nm="${SEOUL_OPEN_DATA_SGG_NM:-}"
work_dir="$(mktemp -d)"

if [[ -n "$seoul_open_data_sgg_nm" ]]; then
  encoded_sgg_nm="$(jq -rn --arg value "$seoul_open_data_sgg_nm" '$value | @uri')"
  scoped_import=true
else
  encoded_sgg_nm=""
  scoped_import=false
fi

case "$db_target" in
  docker|direct)
    ;;
  *)
    echo "DB_TARGET은 docker 또는 direct여야 합니다." >&2
    exit 1
    ;;
esac

if [[ "$db_target" == "direct" && -z "${DB_PASSWORD:-}" ]]; then
  echo "DB_TARGET=direct인 경우 DB_PASSWORD 환경변수가 필요합니다." >&2
  exit 1
fi

cleanup() {
  rm -rf "$work_dir"
}
trap cleanup EXIT

fetch_page() {
  local start_index="$1"
  local end_index="$2"
  local output_file="$3"
  local request_url="$api_base_url/$SEOUL_OPEN_DATA_API_KEY/json/TbTraficWlkNet/$start_index/$end_index/"
  if [[ -n "$encoded_sgg_nm" ]]; then
    request_url+="$encoded_sgg_nm"
  fi

  curl --fail --silent --show-error \
    "$request_url" \
    > "$output_file"
}

first_page="$work_dir/page-1.json"
fetch_page 1 "$page_size" "$first_page"

total_count="$(jq -er '.TbTraficWlkNet.list_total_count | tonumber | floor' "$first_page")"
node_file="$work_dir/nodes.tsv"
edge_file="$work_dir/edges.tsv"

: > "$node_file"
: > "$edge_file"

append_rows() {
  local input_file="$1"

  jq -r '
    def id_value:
      if . == null or . == "" then null
      else try (tostring | gsub("\\s"; "") | tonumber | floor) catch null
      end;
    def text_value:
      if . == null then null
      elif (tostring | gsub("\\s"; "") | length) == 0 then null
      else tostring
      end;
    def copy_value:
      if . == null then "" else tostring end;
    .TbTraficWlkNet.row[]?
    | select((.NODE_TYPE // "" | tostring | gsub("\\s"; "") | ascii_upcase) == "NODE")
    | (.NODE_ID | id_value) as $id
    | (.NODE_WKT | text_value) as $wkt
    | select($id != null and $wkt != null)
    | [$id, (.NODE_TYPE_CD | text_value), $wkt]
    | map(copy_value)
    | @tsv
  ' "$input_file" >> "$node_file"

  jq -r '
    def id_value:
      if . == null or . == "" then null
      else try (tostring | gsub("\\s"; "") | tonumber | floor) catch null
      end;
    def text_value:
      if . == null then null
      elif (tostring | gsub("\\s"; "") | length) == 0 then null
      else tostring
      end;
    def number_value:
      if . == null or . == "" then null
      else try (tostring | gsub("\\s"; "") | tonumber) catch null
      end;
    def copy_value:
      if . == null then "" else tostring end;
    .TbTraficWlkNet.row[]?
    | select((.NODE_TYPE // "" | tostring | gsub("\\s"; "") | ascii_upcase) == "LINK")
    | (.LNKG_ID | id_value) as $id
    | (.BGNG_LNKG_ID | id_value) as $source
    | (.END_LNKG_ID | id_value) as $target
    | (.LNKG_WKT | text_value) as $wkt
    | select($id != null and $source != null and $target != null and $wkt != null)
    | [$id, $source, $target, (.LNKG_TYPE_CD | text_value), (.LNKG_LEN | number_value), $wkt]
    | map(copy_value)
    | @tsv
  ' "$input_file" >> "$edge_file"
}

append_rows "$first_page"

for ((start_index = page_size + 1; start_index <= total_count; start_index += page_size)); do
  end_index=$((start_index + page_size - 1))
  page_file="$work_dir/page-$start_index.json"
  fetch_page "$start_index" "$end_index" "$page_file"
  append_rows "$page_file"

  if (( start_index % 50000 == 1 )); then
    echo "서울시 보행망 다운로드 진행: $start_index / $total_count"
  fi
done

node_row_count="$(wc -l < "$node_file" | tr -d '[:space:]')"
edge_row_count="$(wc -l < "$edge_file" | tr -d '[:space:]')"
source_row_count=$((node_row_count + edge_row_count))

if (( source_row_count != total_count )); then
  echo "서울시 API 행 수와 NODE/LINK 정제 행 수가 일치하지 않습니다." >&2
  echo "원본: $total_count, 노드: $node_row_count, 링크: $edge_row_count" >&2
  exit 1
fi

run_psql() {
  if [[ "$db_target" == "direct" ]]; then
    PGPASSWORD="$DB_PASSWORD" psql \
      --host "$db_host" \
      --port "$db_port" \
      --username "$db_username" \
      --dbname "$db_name" \
      --set ON_ERROR_STOP=1
    return
  fi

  docker compose -f "$compose_file" exec -T "$db_service" \
    sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$1" --dbname "$2" --set ON_ERROR_STOP=1' \
    sh "$db_username" "$db_name"
}

{
  cat <<'SQL'
CREATE TEMP TABLE import_walking_nodes
(
    id              BIGINT,
    node_type_code  VARCHAR(30),
    wkt             TEXT
);

CREATE TEMP TABLE import_walking_edges
(
    id              BIGINT,
    source          BIGINT,
    target          BIGINT,
    link_type_code  VARCHAR(30),
    length_m        DOUBLE PRECISION,
    wkt             TEXT
);

CREATE TEMP TABLE import_expected_counts
(
    source_row_count BIGINT,
    node_row_count   BIGINT,
    edge_row_count   BIGINT,
    scoped_import    BOOLEAN
);

SQL
  printf 'INSERT INTO import_expected_counts VALUES (%s, %s, %s, %s);\n\n' \
    "$total_count" "$node_row_count" "$edge_row_count" "$scoped_import"
  cat <<'SQL'

COPY import_walking_nodes (id, node_type_code, wkt)
FROM STDIN WITH (FORMAT text, DELIMITER E'\t', NULL '');
SQL
  cat "$node_file"
  printf '\\.\n'
  cat <<'SQL'

COPY import_walking_edges (id, source, target, link_type_code, length_m, wkt)
FROM STDIN WITH (FORMAT text, DELIMITER E'\t', NULL '');
SQL
  cat "$edge_file"
  printf '\\.\n'
  cat <<'SQL'

BEGIN;

DO $$
DECLARE
    expected_source_row_count BIGINT;
    expected_node_row_count BIGINT;
    expected_edge_row_count BIGINT;
BEGIN
    SELECT source_row_count, node_row_count, edge_row_count
    INTO expected_source_row_count, expected_node_row_count, expected_edge_row_count
    FROM import_expected_counts;

    IF expected_source_row_count <> expected_node_row_count + expected_edge_row_count
        OR expected_node_row_count = 0
        OR expected_edge_row_count = 0
    THEN
        RAISE EXCEPTION '보행 네트워크 원본 데이터가 비어 있거나 유형별 행 수가 올바르지 않습니다.';
    END IF;

    IF (SELECT COUNT(*) FROM import_walking_nodes) <> expected_node_row_count
        OR (SELECT COUNT(*) FROM import_walking_edges) <> expected_edge_row_count
    THEN
        RAISE EXCEPTION '보행 네트워크 원본 행 정제 결과가 예상 건수와 다릅니다.';
    END IF;
END
$$;

TRUNCATE TABLE walking_edges, walking_nodes;

INSERT INTO walking_nodes (id, node_type_code, geom)
SELECT DISTINCT ON (id)
       id,
       node_type_code,
       ST_GeomFromText(wkt, 4326)
FROM import_walking_nodes
WHERE id IS NOT NULL
  AND wkt IS NOT NULL
  AND GeometryType(ST_GeomFromText(wkt, 4326)) = 'POINT'
  AND ST_IsValid(ST_GeomFromText(wkt, 4326))
ORDER BY id;

INSERT INTO walking_edges (id, source, target, link_type_code, geom, cost, reverse_cost)
SELECT DISTINCT ON (edge.id)
       edge.id,
       edge.source,
       edge.target,
       edge.link_type_code,
       edge.geom,
       edge.cost,
       edge.cost
FROM (
    SELECT import_edge.id,
           import_edge.source,
           import_edge.target,
           import_edge.link_type_code,
           ST_GeomFromText(import_edge.wkt, 4326) AS geom,
           CASE
               WHEN import_edge.length_m > 0 THEN import_edge.length_m
               ELSE ST_Length(ST_GeomFromText(import_edge.wkt, 4326)::geography)
           END AS cost
    FROM import_walking_edges import_edge
) edge
JOIN walking_nodes source_node ON source_node.id = edge.source
JOIN walking_nodes target_node ON target_node.id = edge.target
WHERE edge.id IS NOT NULL
  AND edge.source IS NOT NULL
  AND edge.target IS NOT NULL
  AND edge.source <> edge.target
  AND GeometryType(edge.geom) = 'LINESTRING'
  AND ST_IsValid(edge.geom)
  AND edge.cost > 0
ORDER BY edge.id;

DO $$
DECLARE
    expected_unique_node_count BIGINT;
    expected_eligible_edge_count BIGINT;
    actual_node_row_count BIGINT;
    actual_edge_row_count BIGINT;
BEGIN
    SELECT COUNT(DISTINCT id)
    INTO expected_unique_node_count
    FROM import_walking_nodes;

    SELECT COUNT(DISTINCT edge.id)
    INTO expected_eligible_edge_count
    FROM (
        SELECT import_edge.id,
               import_edge.source,
               import_edge.target,
               ST_GeomFromText(import_edge.wkt, 4326) AS geom,
               CASE
                   WHEN import_edge.length_m > 0 THEN import_edge.length_m
                   ELSE ST_Length(ST_GeomFromText(import_edge.wkt, 4326)::geography)
               END AS cost
        FROM import_walking_edges import_edge
    ) edge
    JOIN walking_nodes source_node ON source_node.id = edge.source
    JOIN walking_nodes target_node ON target_node.id = edge.target
    WHERE edge.id IS NOT NULL
      AND edge.source IS NOT NULL
      AND edge.target IS NOT NULL
      AND edge.source <> edge.target
      AND GeometryType(edge.geom) = 'LINESTRING'
      AND ST_IsValid(edge.geom)
      AND edge.cost > 0;

    SELECT COUNT(*) INTO actual_node_row_count FROM walking_nodes;
    SELECT COUNT(*) INTO actual_edge_row_count FROM walking_edges;

    IF actual_node_row_count <> expected_unique_node_count
        OR actual_edge_row_count <> expected_eligible_edge_count
    THEN
        RAISE EXCEPTION '보행 네트워크 검증 실패: 노드 %, 링크 %, 예상 노드 %, 예상 링크 %',
            actual_node_row_count, actual_edge_row_count,
            expected_unique_node_count, expected_eligible_edge_count;
    END IF;

END
$$;

INSERT INTO walking_network_metadata (
    id, status, source, source_row_count, node_count, edge_count, imported_at
)
SELECT
    1, 'READY', CASE WHEN scoped_import THEN 'SEOUL_POC' ELSE 'SEOUL' END,
    (SELECT COUNT(*) FROM walking_nodes) + (SELECT COUNT(*) FROM walking_edges),
    (SELECT COUNT(*) FROM walking_nodes),
    (SELECT COUNT(*) FROM walking_edges),
    CURRENT_TIMESTAMP
FROM import_expected_counts
ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    source = EXCLUDED.source,
    source_row_count = EXCLUDED.source_row_count,
    node_count = EXCLUDED.node_count,
    edge_count = EXCLUDED.edge_count,
    imported_at = EXCLUDED.imported_at;

COMMIT;

SELECT
    (SELECT COUNT(*) FROM walking_nodes) AS walking_node_count,
    (SELECT COUNT(*) FROM walking_edges) AS walking_edge_count;
SQL
} | run_psql

echo "서울시 보행 네트워크 적재가 완료되었습니다. 총 원본 행: $total_count"
