#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/parse-jdbc-db-url.sh"

check_valid() (
  export DB_URL="$1" PGSSLMODE=require
  # 기존 runner 환경변수가 있더라도 JDBC URL이 우선해야 한다.
  export DB_HOST=wrong DB_PORT=1 DB_NAME=wrong
  configure_db_from_jdbc_url
  [[ "$DB_HOST:$DB_PORT/$DB_NAME" == "$2" ]]
  [[ "$PGHOST:$PGPORT/$PGDATABASE" == "$2" ]]
  [[ "$PGSSLMODE" == "$3" ]]
)

check_valid 'jdbc:postgresql://dev.example.com:5432/jumin_dev' 'dev.example.com:5432/jumin_dev' require
check_valid 'jdbc:postgresql://127.0.0.1/jumin' '127.0.0.1:5432/jumin' require
check_valid 'jdbc:postgresql://[::1]:05432/jumin?sslmode=require' '::1:5432/jumin' require
check_valid 'jdbc:postgresql://prod.example.com:5433/jumin?sslmode=verify-full' 'prod.example.com:5433/jumin' verify-full
check_valid 'jdbc:postgresql://prod.example.com/jumin?ssl=true' 'prod.example.com:5432/jumin' verify-full

for invalid in \
  '' \
  'postgresql://host/db' \
  'jdbc:postgresql://host/' \
  'jdbc:postgresql://host:0/db' \
  'jdbc:postgresql://host:65536/db' \
  'jdbc:postgresql://user:secret@host/db' \
  'jdbc:postgresql://host,other/db' \
  'jdbc:postgresql://host/db?currentSchema=other' \
  'jdbc:postgresql://host/db?sslmode=require&sslmode=disable' \
  'jdbc:postgresql://host/db?sslmode=require&' \
  'jdbc:postgresql://host/db?sslmode=unknown' \
  'jdbc:postgresql://host/db%20name' \
  $'jdbc:postgresql://host/db\nsecret'; do
  if output="$(DB_URL="$invalid" configure_db_from_jdbc_url 2>&1)"; then
    echo 'Invalid JDBC URL was accepted.' >&2
    exit 1
  fi
  if [[ -n "$invalid" && "$output" == *"$invalid"* ]]; then
    echo 'JDBC URL leaked into error output.' >&2
    exit 1
  fi
done
echo 'JDBC URL parsing tests passed.'
