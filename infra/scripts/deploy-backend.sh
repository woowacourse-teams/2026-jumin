#!/usr/bin/env bash
set +x
set -Eeuo pipefail

environment="${1:-}"
if [[ "$environment" != dev && "$environment" != prod ]]; then
  echo 'Usage: deploy-backend.sh dev | prod [rollback backend|backend-blue|backend-green]' >&2
  exit 2
fi

rollback_target=''
case "$#" in
  1) ;;
  3)
    [[ "$environment" == prod && "$2" == rollback && ( "$3" == backend || "$3" == backend-blue || "$3" == backend-green ) ]] || exit 2
    rollback_target="$3"
    ;;
  *) exit 2 ;;
esac

: "${BACKEND_RELEASE_ROOT:?BACKEND_RELEASE_ROOT is required}"
repository_root="${GITHUB_WORKSPACE:-$PWD}"
routing_dir="$(dirname "$BACKEND_RELEASE_ROOT")/proxy/backend-routing"
route_file="$routing_dir/active.conf"
current_link="$BACKEND_RELEASE_ROOT/current"
proxy="jumin-nginx-$environment"

if [[ "$environment" == dev ]]; then
  mkdir -p "$BACKEND_RELEASE_ROOT"
  exec 9>>"$BACKEND_RELEASE_ROOT/.backend-deploy.lock"
  lock_options=(-n)
else
  mkdir -p "$routing_dir"
  # 운영 프록시 CD와 인증서 갱신도 같은 디렉터리에 잠금을 건다.
  exec 9<"$routing_dir"
  lock_options=(-w 60)
fi
flock "${lock_options[@]}" 9 || { echo 'Another backend or proxy operation is active.' >&2; exit 1; }

fail() {
  echo "$1" >&2
  exit 1
}

[[ ! -e "$current_link" || -L "$current_link" ]] || fail 'The current release must be a symlink.'
previous_release="$(readlink "$current_link" || true)"

compose_files=(--file "$repository_root/infra/docker-compose.$environment.yml")

health_up() {
  grep -Eq '"status"[[:space:]]*:[[:space:]]*"UP"' <<< "$1"
}

prepare_release() {
  local variable
  for variable in GITHUB_SHA GITHUB_RUN_ID GITHUB_RUN_ATTEMPT BACKEND_ARTIFACT_DIR; do
    [[ -n "${!variable:-}" ]] || fail "Missing deployment setting: $variable"
  done
  if [[ "${LOCAL_SEARCH_REST_API_KEY:-}" =~ ^[[:space:]]+$ ]]; then
    fail 'LOCAL_SEARCH_REST_API_KEY contains only whitespace.'
  fi
  [[ "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ && "$GITHUB_RUN_ID" =~ ^[0-9]+$ && "$GITHUB_RUN_ATTEMPT" =~ ^[0-9]+$ ]] ||
    fail 'Invalid backend release ID.'
  case "${PARKING_AVAILABILITY_ENABLED:-false}" in
    true) [[ -n "${SEOUL_PARKING_API_KEY:-}" && -n "${BUSAN_PARKING_API_KEY:-}" ]] || fail 'Missing parking API keys.' ;;
    false) ;;
    *) fail 'PARKING_AVAILABILITY_ENABLED must be true or false.' ;;
  esac

  release_id="${GITHUB_SHA}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
  release_dir="$BACKEND_RELEASE_ROOT/releases/$release_id"
  mkdir -p "$release_dir"
  export JUMIN_VIEWPORT_CACHE_ENABLED="${JUMIN_VIEWPORT_CACHE_ENABLED:-false}"
  export JUMIN_VIEWPORT_CACHE_ENVIRONMENT="${JUMIN_VIEWPORT_CACHE_ENVIRONMENT:-${environment}_sq_ttl}"
  export JUMIN_VIEWPORT_CACHE_REDISTLSCAFILE=''
  case "$JUMIN_VIEWPORT_CACHE_ENABLED" in
    true)
      [[ -n "${JUMIN_VIEWPORT_CACHE_REDISUSERNAME:-}" && -n "${JUMIN_VIEWPORT_CACHE_REDISPASSWORD:-}" &&
         -n "${VIEWPORT_REDIS_TLS_CA_PEM:-}" ]] || { echo 'Missing Redis environment Secrets.' >&2; exit 1; }
      export VIEWPORT_REDIS_TLS_CA_PATH="$release_dir/redis-ca.pem"
      printf '%s\n' "$VIEWPORT_REDIS_TLS_CA_PEM" > "$VIEWPORT_REDIS_TLS_CA_PATH"
      chmod 644 "$VIEWPORT_REDIS_TLS_CA_PATH"
      export JUMIN_VIEWPORT_CACHE_REDISTLSCAFILE='/app/redis-ca.pem'
      python3 - "$VIEWPORT_REDIS_TLS_CA_PATH" <<'PY'
import os, socket, ssl, sys
from urllib.parse import urlsplit
try:
    uri=urlsplit(os.environ['JUMIN_VIEWPORT_CACHE_REDISURI'])
    if uri.scheme!='rediss' or not uri.hostname or not uri.port or uri.username or uri.password or uri.query or uri.fragment or uri.path not in ('','/'):
        raise ValueError()
    context=ssl.create_default_context(cafile=sys.argv[1])
    with socket.create_connection((uri.hostname,uri.port),timeout=3) as raw:
        with context.wrap_socket(raw,server_hostname=uri.hostname) as connection:
            stream=connection.makefile('rb')
            for command,expected in [(['AUTH',os.environ['JUMIN_VIEWPORT_CACHE_REDISUSERNAME'],os.environ['JUMIN_VIEWPORT_CACHE_REDISPASSWORD']],b'+OK\r\n'),(['PING'],b'+PONG\r\n')]:
                parts=[part.encode() for part in command]
                connection.sendall(b'*'+str(len(parts)).encode()+b'\r\n'+b''.join(b'$'+str(len(part)).encode()+b'\r\n'+part+b'\r\n' for part in parts))
                if stream.readline(1024)!=expected: raise ValueError()
except Exception:
    sys.exit('Redis TLS/authentication preflight failed; check environment Secrets.')
PY
      if [[ "$environment" == prod ]]; then
        compose_files+=(--file "$repository_root/infra/docker-compose.viewport.prod.yml")
      else
        compose_files+=(--file "$repository_root/infra/docker-compose.viewport.yml")
      fi ;;
    false) ;;
    *) echo 'VIEWPORT_CACHE_ENABLED must be true or false.' >&2; exit 1 ;;
  esac

  test -s "$BACKEND_ARTIFACT_DIR/app.jar"
  if [[ -f "$BACKEND_ARTIFACT_DIR/app.jar.sha256" ]]; then
    (cd "$BACKEND_ARTIFACT_DIR" && sha256sum --check app.jar.sha256)
  fi
  cp "$BACKEND_ARTIFACT_DIR/app.jar" "$release_dir/app.jar"
  docker build --file "$repository_root/server/Dockerfile" --build-arg "APP_COMMIT_SHA=$GITHUB_SHA" \
    --tag "jumin-backend:$release_id" "$release_dir"
}

# 개발은 단일 컨테이너를 교체하고, 운영만 아래 슬롯 전환을 실행한다.
if [[ "$environment" == dev ]]; then
  prepare_release
  container=jumin-backend-dev
  previous_image="$(docker inspect --format '{{.Config.Image}}' "$container" 2>/dev/null || true)"
  previous_tag=''
  [[ "$previous_image" != jumin-backend:* ]] || previous_tag="${previous_image#jumin-backend:}"

  compose_up() {
    IMAGE_TAG="$1" docker compose --project-name jumin-dev "${compose_files[@]}" up --detach --no-deps backend
  }

  healthy() {
    local response attempt
    for (( attempt=1; attempt<=12; attempt++ )); do
      if response="$(curl --noproxy '*' --fail --silent --show-error --connect-timeout 2 --max-time 5 \
        "http://127.0.0.1:${BACKEND_PORT:-8080}/actuator/health")" && health_up "$response"; then
        return 0
      fi
      sleep 5
    done
    return 1
  }

  if ! compose_up "$release_id" || ! healthy; then
    echo 'Development backend deployment failed.' >&2
    if [[ -n "$previous_tag" ]]; then
      echo 'Restoring previous backend image.' >&2
      compose_up "$previous_tag" && healthy || echo 'Rollback failed; intervention required.' >&2
    fi
    exit 1
  fi
  ln -sfn "$release_dir" "$current_link"
  echo "Backend dev deployment succeeded: $release_id"
  exit 0
fi

container_for() {
  printf 'jumin-backend-%s%s\n' "$environment" "${1#backend}"
}

running() {
  [[ "$(docker inspect --format '{{.State.Running}}' "$1" 2>/dev/null)" == true ]]
}

proxy_serves() {
  local path=route response
  if [[ "${2:-}" == healthy ]]; then
    path=health
  fi
  # 컨테이너 안에서 헤더와 본문 스트림을 합쳐 Docker가 출력 순서를 바꾸지 않게 한다.
  response="$(docker exec "$proxy" sh -c 'wget -Y off -q -S -T 7 -O - "$1" 2>&1' sh \
    "http://127.0.0.1:18080/$path")" || true
  grep -Fxiq "X-Jumin-Backend: http://$1:8080" <<< "$(tr -d '\r' <<< "$response" | sed 's/^[[:blank:]]*//')" ||
    return 1
  if [[ "$path" == route ]]; then
    grep -Eq '^[[:blank:]]*HTTP/[0-9.]+ 204 ' <<< "$response"
    return
  fi
  grep -Eq '^[[:blank:]]*HTTP/[0-9.]+ 200 ' <<< "$response" && health_up "$response" || return 2
}

wait_for_proxy() {
  local attempt
  for (( attempt=1; attempt<=12; attempt++ )); do
    if proxy_serves "$@"; then
      return 0
    elif [[ $? == 2 ]]; then
      # 새 워커가 후보를 보고 이미 실패를 반환하면 즉시 복구한다.
      return 1
    fi
    sleep 1
  done
  return 1
}

nginx_workers() {
  docker exec "$proxy" ps -o pid,ppid,args |
    awk '$2 == 1 && $3 == "nginx:" && $4 == "worker" { print }'
}

wait_for_workers() {
  local old_workers="$1" max_attempts="${2:-60}" current_workers attempt
  local old_pids
  old_pids="$(awk '{ print $1 }' <<< "$old_workers")"
  # 기존 요청을 기다리되 배포 작업이 무기한 대기하지 않게 한다.
  for (( attempt=1; attempt<=max_attempts; attempt++ )); do
    current_workers="$(nginx_workers)" || return 1
    if [[ "$current_workers" != *"is shutting down"* ]] &&
      ! grep -Fxq -f <(printf '%s\n' "$old_pids") <(awk '{ print $1 }' <<< "$current_workers"); then
      return 0
    fi
    (( attempt < max_attempts )) || break
    sleep 1
  done
  return 1
}

reload_proxy() {
  docker exec "$proxy" nginx -t && docker exec "$proxy" nginx -s reload
}

route_to() {
  if [[ -z "$1" ]]; then
    rm -f "$route_file"
    return
  fi
  printf '~^ http://%s:8080;\n' "$1" > "$routing_dir/.active.tmp" &&
    mv -f "$routing_dir/.active.tmp" "$route_file"
}

wait_for_backend() {
  local path=/actuator/health response attempt
  if [[ "$target" != backend ]]; then
    path+=/readiness
  fi
  local probe=(docker exec "$candidate" curl --fail --silent --max-time 3 "http://127.0.0.1:8080$path")
  if [[ "$proxy_running" == true ]]; then
    probe=(docker exec "$proxy" wget -Y off -q -T 3 -O - "http://$target:8080$path")
  fi
  # 36회까지 검사해 이미지 기동과 Flyway 실행을 기다린다.
  for (( attempt=1; attempt<=36; attempt++ )); do
    if response="$("${probe[@]}" 2>/dev/null)" && health_up "$response"; then
      return 0
    fi
    sleep 3
  done
  return 1
}

active=backend
previous_route=''
if [[ -f "$route_file" ]]; then
  case "$(cat "$route_file")" in
    '~^ http://backend:8080;') ;;
    '~^ http://backend-blue:8080;') active=backend-blue ;;
    '~^ http://backend-green:8080;') active=backend-green ;;
    *) fail "Unrecognized backend routing file: $route_file" ;;
  esac
  previous_route="$active"
fi

proxy_running=false
if running "$proxy"; then
  proxy_running=true
  wait_for_proxy "$active" || fail 'The proxy route does not match. Verify the proxy rollout and routing file.'
  touch "$routing_dir/.initialized"
elif docker inspect "$proxy" >/dev/null 2>&1 || [[ -f "$routing_dir/.initialized" ]] || running "$(container_for backend)"; then
  fail 'The active backend requires a running proxy before deployment.'
elif [[ -z "$previous_route" ]]; then
  active=''
fi

target=backend-blue
if [[ "$active" == backend-blue ]]; then
  target=backend-green
fi
if [[ -n "$rollback_target" ]]; then
  [[ -n "$active" && "$rollback_target" != "$active" ]] || fail 'Rollback requires a different active backend.'
  target="$rollback_target"
fi
candidate="$(container_for "$target")"

viewport_cache_mode() {
  docker inspect --format '{{range .Config.Env}}{{ $parts := split . "=" }}{{if eq (index $parts 0) "JUMIN_VIEWPORT_CACHE_ENABLED"}}{{index $parts 1}}{{end}}{{end}}' "$1"
}

check_legacy_cache_overlap() {
  local target_mode="$1" slot container
  local legacy
  legacy="$(container_for backend)"
  if [[ "$target" != backend ]]; then
    if [[ "$target_mode" == true ]] && running "$legacy" && [[ -z "$(viewport_cache_mode "$legacy")" ]]; then
      fail 'Disable the viewport cache until the backend without viewport mapping support has stopped.'
    fi
    return
  fi

  if [[ -z "$target_mode" ]]; then
    for slot in backend-blue backend-green; do
      container="$(container_for "$slot")"
      if running "$container" && [[ "$(viewport_cache_mode "$container")" == true ]]; then
        fail 'Disable the viewport cache before rolling back to a backend without viewport mapping support.'
      fi
    done
  fi
}

candidate_already_running=false
if [[ -n "$rollback_target" ]]; then
  image="$(docker inspect --format '{{.Config.Image}}' "$candidate")"
  release_id="${image#jumin-backend:}"
  legacy_release='^[a-f0-9]{12}-[0-9]+-[0-9]+$'
  slot_release='^[a-f0-9]{40}-[0-9]+-[0-9]+$'
  if [[ "$image" != jumin-backend:* ]] ||
    [[ ! "$release_id" =~ $slot_release && ( "$target" != backend || ! "$release_id" =~ $legacy_release ) ]]; then
    fail 'The rollback container does not have a managed release image.'
  fi
  release_dir="$BACKEND_RELEASE_ROOT/releases/$release_id"
  [[ -d "$release_dir" && ( "$target" == backend || -f "$release_dir/.promoted" ) ]] ||
    fail 'The rollback target was not promoted successfully.'
  check_legacy_cache_overlap "$(viewport_cache_mode "$candidate")"
  # 보관 컨테이너는 생성 당시 설정을 사용하므로 활성 슬롯과 비교한 뒤 시작한다.
  docker inspect "$(container_for "$active")" "$candidate" |
    python3 "$repository_root/infra/scripts/validate-rollback-settings.py"
  if running "$candidate"; then
    candidate_already_running=true
  fi
else
  if [[ "$active" == backend ]]; then
    check_legacy_cache_overlap "${JUMIN_VIEWPORT_CACHE_ENABLED:-false}"
  fi
  prepare_release
fi

stop_inactive_backends() {
  local active_slot="$1" slot container
  for slot in backend backend-blue backend-green; do
    container="$(container_for "$slot")"
    if [[ "$slot" != "$active_slot" ]] && running "$container"; then
      docker stop "$container" >/dev/null || return 1
    fi
  done
}

if [[ "$proxy_running" == true && -z "$rollback_target" ]]; then
  for slot in backend backend-blue backend-green; do
    if [[ "$slot" != "$active" ]] && running "$(container_for "$slot")"; then
      # 직전 전환이 중단됐거나 이전 요청이 남아 있으면 슬롯을 덮어쓰기 전에 비운다.
      workers="$(nginx_workers)"
      [[ -n "$workers" ]] && reload_proxy && wait_for_proxy "$active" && wait_for_workers "$workers" ||
        fail 'An inactive slot may still be serving requests. Retry after the proxy drains.'
      stop_inactive_backends "$active" || fail 'Could not stop an inactive backend.'
      break
    fi
  done
fi

schedule_drain_cleanup() {
  local retained_active="$1" workers="$2" workers_generation="$3"
  local snapshot monitor slot container
  local containers=()
  snapshot="$(mktemp "$routing_dir/.drain-route.XXXXXX")"
  # 하드 링크로 이번 전환의 inode를 보존해 이후 같은 슬롯으로 돌아와도 구분한다.
  rm -f "$snapshot"
  ln "$route_file" "$snapshot"
  monitor="$release_dir/drain-backend.sh"
  install -m 755 "$repository_root/infra/scripts/drain-backend.sh" "$monitor.next.$$"
  mv -f "$monitor.next.$$" "$monitor"
  for slot in backend backend-blue backend-green; do
    container="$(container_for "$slot")"
    if [[ "$slot" != "$retained_active" ]] && running "$container"; then
      docker update --restart=no "$container" >/dev/null
      containers+=("$slot=$(docker inspect --format '{{.Id}}' "$container")")
    fi
  done
  # Runner의 종료 정리가 모니터를 종료하지 않게 하고 부모의 배포 잠금을 닫는다.
  env -u RUNNER_TRACKING_ID nohup bash "$monitor" "$environment" "$BACKEND_RELEASE_ROOT" \
    "$snapshot" "$(awk '{ print $1 }' <<< "$workers")" \
    "$workers_generation" "${containers[@]}" \
    9<&- >"$release_dir/drain.log" 2>&1 < /dev/null &
}

route_changed=false
committed=false
previous_cleanup_pending=false
current_changed=false
promotion_recorded=false
cleanup() {
  trap '' INT TERM
  if [[ "$committed" == true ]]; then
    # 전환 후 대기 중 취소돼도 원래 워커 정보를 별도 모니터에 전달한다.
    if [[ "$previous_cleanup_pending" == true ]]; then
      if [[ "$proxy_running" == true ]]; then
        schedule_drain_cleanup "$target" "$workers" "$workers_generation"
      else
        stop_inactive_backends "$target" || echo 'Could not stop an inactive backend.' >&2
      fi
    fi
    return
  fi
  local workers='' workers_generation=''

  if [[ "$promotion_recorded" == true ]]; then
    rm -f "$release_dir/.promoted" || echo 'Could not clear the promotion record.' >&2
  fi

  if [[ "$route_changed" == true ]]; then
    if [[ "$proxy_running" == true ]]; then
      workers_generation="$(docker inspect --format '{{.Id}} {{.State.StartedAt}}' "$proxy")" || workers_generation=''
      workers="$(nginx_workers)" || workers=''
    fi
    if ! route_to "$previous_route"; then
      echo 'Could not restore the routing file. Both backends were retained.' >&2
      return
    fi
    if [[ "$proxy_running" == true ]] &&
      ! { [[ -n "$workers" ]] && reload_proxy && wait_for_proxy "$active"; }; then
      echo 'Could not verify rollback. Both backends were retained.' >&2
      return
    fi
    echo 'Restored previous backend routing.' >&2
  fi

  if [[ "$current_changed" == true ]]; then
    if [[ -n "$previous_release" ]]; then
      ln -sfn "$previous_release" "$current_link" || echo 'Could not restore the previous release link.' >&2
    elif [[ -L "$current_link" ]]; then
      unlink "$current_link" || echo 'Could not remove the current release link.' >&2
    fi
  fi

  if [[ "$route_changed" == true && "$proxy_running" == true ]]; then
    if wait_for_workers "$workers" 1; then
      stop_inactive_backends "$active" || echo 'Could not stop an inactive backend.' >&2
    elif [[ -z "$previous_route" ]]; then
      cat >&2 <<EOF
Manual cleanup required. $candidate is still running.
Run curl -si http://127.0.0.1:18080/route and confirm HTTP 204 and the following response header.
  X-Jumin-Backend: http://$active:8080
Run docker exec $proxy ps -o pid,ppid,args.
Wait for Nginx worker PIDs $(awk '{ print $1 }' <<< "$workers" | paste -sd ' ' -) to exit.
Confirm there are no Nginx workers marked 'is shutting down'.
Then run docker stop $candidate before retrying the deployment.
EOF
    else
      schedule_drain_cleanup "$active" "$workers" "$workers_generation"
      echo 'Rollback restored. Cleanup is monitoring the retained backends.' >&2
    fi
    return
  fi

  if [[ "$candidate_already_running" == false ]] && running "$candidate"; then
    docker stop "$candidate" >/dev/null || echo "Could not stop $candidate." >&2
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ -n "$rollback_target" ]]; then
  if [[ "$candidate_already_running" == false ]]; then
    docker start "$candidate" >/dev/null
  fi
else
  network="jumin-${environment}_default"
  if ! docker network inspect "$network" >/dev/null 2>&1; then
    docker network create "$network" >/dev/null
  fi
  # 이전 CD가 같은 네트워크를 쓰더라도 --remove-orphans 범위에 슬롯이 들지 않게 한다.
  BACKEND_NETWORK_EXTERNAL=true IMAGE_TAG="$release_id" docker compose \
    --project-name "jumin-backend-$environment" "${compose_files[@]}" up --detach --no-deps "$target"
fi
wait_for_backend || fail "Backend readiness failed for $candidate."

workers=''
workers_generation=''
if [[ "$proxy_running" == true ]]; then
  workers_generation="$(docker inspect --format '{{.Id}} {{.State.StartedAt}}' "$proxy")"
  workers="$(nginx_workers)"
  [[ -n "$workers" ]] || fail 'No running Nginx workers found.'
fi
route_changed=true
route_to "$target"
if [[ "$proxy_running" == true ]]; then
  reload_proxy && wait_for_proxy "$target" healthy || fail 'The proxy did not switch to the candidate.'
fi

if [[ -z "$rollback_target" && ! -f "$release_dir/.promoted" ]]; then
  promotion_recorded=true
  touch "$release_dir/.promoted"
fi
docker update --restart=unless-stopped "$candidate" >/dev/null
current_changed=true
ln -sfn "$release_dir" "$current_link"
previous_cleanup_pending=true
committed=true

if [[ "$proxy_running" == true ]]; then
  if wait_for_workers "$workers"; then
    if stop_inactive_backends "$target"; then
      previous_cleanup_pending=false
    else
      echo 'Could not stop an inactive backend.' >&2
    fi
  else
    schedule_drain_cleanup "$target" "$workers" "$workers_generation"
    previous_cleanup_pending=false
    echo 'Previous Nginx workers have not drained. Cleanup is monitoring the retained backends.' >&2
  fi
else
  # 아직 프록시가 설치되지 않은 초기 슬롯은 진행 중인 프록시 요청이 없다.
  if stop_inactive_backends "$target"; then
    previous_cleanup_pending=false
  else
    echo 'Could not stop an inactive backend.' >&2
  fi
fi
echo "Backend $environment deployment succeeded: $release_id ($target)"
