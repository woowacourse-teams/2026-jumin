#!/usr/bin/env bash
set -Eeuo pipefail

# release 안의 사본을 실행해 checkout과 Actions job 종료 뒤에도 요청 종료를 확인한다.
environment="${1:?}"
release_root="${2:?}"
snapshot="${3:?}"
old_pids="${4:?}"
proxy_generation="${5:?}"
shift 5
[[ "$environment" == prod ]] || exit 2
routing_dir="$(dirname "$release_root")/proxy/backend-routing"
route_file="$routing_dir/active.conf"
proxy="jumin-nginx-$environment"
trap 'rm -f "$snapshot"' EXIT

warned=false
echo 'Waiting for previous Nginx requests to finish.'
while [[ "$route_file" -ef "$snapshot" ]]; do
  if [[ "$warned" == false ]] && (( SECONDS >= 600 )); then
    warned=true
    release_dir="${BASH_SOURCE[0]%/*}"
    warning="Previous Nginx requests have not drained after 10 minutes. release=${release_dir##*/} retained=$*"
    printf '%s\n' "$warning" >&2
    logger --journald <<EOF || echo 'Could not write the drain warning to the system journal.' >&2
SYSLOG_IDENTIFIER=jumin-backend-drain
PRIORITY=4
MESSAGE=$warning
EOF
  fi

  exec 9<"$routing_dir"
  if ! flock -n 9; then
    exec 9<&-
    sleep 5
    continue
  fi
  # 다음 배포나 롤백이 라우팅을 바꿨다면 그 작업이 슬롯 정리를 담당한다.
  [[ "$route_file" -ef "$snapshot" ]] || exit 0
  expected="$(awk '{ print $2 }' "$snapshot")"
  expected="${expected%;}"
  response="$(docker exec "$proxy" sh -c 'wget -Y off -q -S -T 7 -O /dev/null "$1" 2>&1' sh \
    http://127.0.0.1:18080/route)" || response=''
  if grep -Eq '^[[:blank:]]*HTTP/[0-9.]+ 204 ' <<< "$response" &&
    grep -Fxiq "X-Jumin-Backend: $expected" <<< "$(tr -d '\r' <<< "$response" | sed 's/^[[:blank:]]*//')"; then
    workers="$(docker exec "$proxy" ps -o pid,ppid,args |
      awk '$2 == 1 && $3 == "nginx:" && $4 == "worker" { print }')" || workers=''
    generation="$(docker inspect --format '{{.Id}} {{.State.StartedAt}}' "$proxy")" || generation=''
    if [[ -n "$workers" && -n "$generation" && "$workers" != *"is shutting down"* ]] &&
      { [[ "$generation" != "$proxy_generation" ]] ||
        ! grep -Fxq -f <(printf '%s\n' "$old_pids") <(awk '{ print $1 }' <<< "$workers"); }; then
      # 컨테이너 ID를 고정해 같은 슬롯에 새로 생성한 컨테이너를 건드리지 않는다.
      for retained in "$@"; do
        container_id="${retained#*=}"
        docker stop "$container_id" >/dev/null
        echo "Stopped drained backend $container_id."
      done
      exit 0
    fi
  fi
  exec 9<&-
  sleep 5
done
echo 'Routing changed. The newer deployment owns backend cleanup.'
