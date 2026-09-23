#!/usr/bin/env bash
# source로 호출하여 기존 JDBC Secret을 psql과 적재 스크립트의 환경변수로 변환한다.
# URL이나 인증 정보는 로그에 출력하지 않는다.
configure_db_from_jdbc_url() {
  local pattern='^jdbc:postgresql://([a-zA-Z0-9][a-zA-Z0-9.-]*|\[[0-9a-fA-F:]+\])(:([0-9]+))?/([a-zA-Z0-9_][a-zA-Z0-9_.-]*)(\?([^#[:space:]]+))?$'
  if [[ ! ${DB_URL:-} =~ $pattern ]]; then
    echo 'DB_URL must be a single-host jdbc:postgresql://host[:port]/database URL.' >&2
    return 1
  fi
  local host="${BASH_REMATCH[1]}" port="${BASH_REMATCH[3]:-5432}"
  local database="${BASH_REMATCH[4]}" query="${BASH_REMATCH[6]}"
  local sslmode="${PGSSLMODE:-require}" parameter seen_ssl=false
  local -a parameters=()
  if (( ${#port} > 5 )) || (( 10#$port < 1 || 10#$port > 65535 )); then
    echo 'DB_URL contains an invalid port.' >&2
    return 1
  fi
  # JDBC 옵션을 무시하면 접속 대상이나 스키마가 달라질 수 있으므로 지원하지 않는 옵션은 거부한다.
  if [[ -n "$query" ]]; then
    if [[ "$query" == *'&&'* || "$query" == '&'* || "$query" == *'&' ]]; then
      echo 'DB_URL contains an invalid query string.' >&2
      return 1
    fi
    IFS='&' read -r -a parameters <<< "$query"
    for parameter in "${parameters[@]}"; do
      if [[ "$seen_ssl" == true ]]; then
        echo 'DB_URL contains unsupported or duplicate connection options; only sslmode or ssl=true is supported.' >&2
        return 1
      fi
      case "$parameter" in
        sslmode=disable|sslmode=allow|sslmode=prefer|sslmode=require|sslmode=verify-ca|sslmode=verify-full)
          sslmode="${parameter#sslmode=}" ;;
        ssl=true) sslmode=verify-full ;;
        *)
          echo 'DB_URL contains unsupported connection options; only sslmode or ssl=true is supported.' >&2
          return 1 ;;
      esac
      seen_ssl=true
    done
  fi
  host="${host#[}"
  host="${host%]}"
  export DB_HOST="$host" DB_PORT="$((10#$port))" DB_NAME="$database"
  export PGHOST="$DB_HOST" PGPORT="$DB_PORT" PGDATABASE="$DB_NAME" PGSSLMODE="$sslmode"
}
