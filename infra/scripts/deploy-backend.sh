#!/usr/bin/env bash
set +x
set -Eeuo pipefail

environment="${1:-}"
[[ $# -eq 1 && ( "$environment" == dev || "$environment" == prod ) ]] || exit 2
repository_root="${GITHUB_WORKSPACE:-$PWD}"
for variable in GITHUB_SHA GITHUB_RUN_ID GITHUB_RUN_ATTEMPT BACKEND_ARTIFACT_DIR BACKEND_RELEASE_ROOT BACKEND_PORT; do
  [[ -n "${!variable:-}" ]] || { echo "Missing deployment setting: $variable" >&2; exit 1; }
done
[[ "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ && "$GITHUB_RUN_ID" =~ ^[0-9]+$ && "$GITHUB_RUN_ATTEMPT" =~ ^[0-9]+$ ]] || exit 1
case "${PARKING_AVAILABILITY_ENABLED:-false}" in
  true) [[ -n "${SEOUL_PARKING_API_KEY:-}" && -n "${BUSAN_PARKING_API_KEY:-}" ]] || exit 1 ;;
  false) ;;
  *) exit 1 ;;
esac
mkdir -p "$BACKEND_RELEASE_ROOT"
exec 9>>"$BACKEND_RELEASE_ROOT/.backend-deploy.lock"
flock -n 9 || { echo 'Another backend deployment is active.' >&2; exit 1; }
release_id="${GITHUB_SHA}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
release_dir="$BACKEND_RELEASE_ROOT/releases/$release_id"
mkdir -p "$release_dir"
export JUMIN_VIEWPORT_CACHE_ENABLED="${JUMIN_VIEWPORT_CACHE_ENABLED:-false}"
export JUMIN_VIEWPORT_CACHE_ENVIRONMENT="${JUMIN_VIEWPORT_CACHE_ENVIRONMENT:-${environment}_sq_ttl}"
export JUMIN_VIEWPORT_CACHE_REDISTLSCAFILE=''
compose_files=(--file "$repository_root/infra/docker-compose.$environment.yml")
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
    compose_files+=(--file "$repository_root/infra/docker-compose.viewport.yml") ;;
  false) ;;
  *) echo 'VIEWPORT_CACHE_ENABLED must be true or false.' >&2; exit 1 ;;
esac
container="jumin-backend-$environment"
previous_image="$(docker inspect --format '{{.Config.Image}}' "$container" 2>/dev/null || true)"
previous_tag=''
[[ "$previous_image" != jumin-backend:* ]] || previous_tag="${previous_image#jumin-backend:}"
test -s "$BACKEND_ARTIFACT_DIR/app.jar"
if [[ -f "$BACKEND_ARTIFACT_DIR/app.jar.sha256" ]]; then
  (cd "$BACKEND_ARTIFACT_DIR" && sha256sum --check app.jar.sha256)
fi
cp "$BACKEND_ARTIFACT_DIR/app.jar" "$release_dir/app.jar"
docker build --file "$repository_root/server/Dockerfile" --build-arg "APP_COMMIT_SHA=$GITHUB_SHA" --tag "jumin-backend:$release_id" "$release_dir"
compose_up() {
  IMAGE_TAG="$1" docker compose --project-name "jumin-$environment" "${compose_files[@]}" up --detach --no-deps --remove-orphans backend
}
healthy() {
  for _ in $(seq 1 12); do
    if curl --noproxy '*' --fail --silent --show-error --connect-timeout 2 --max-time 5 "http://127.0.0.1:$BACKEND_PORT/actuator/health" >/dev/null; then return 0; fi
    sleep 5
  done
  return 1
}
if ! compose_up "$release_id" || ! healthy; then
  echo 'Backend deployment failed.' >&2
  if [[ -n "$previous_tag" ]]; then
    echo 'Restoring previous backend image.' >&2
    compose_up "$previous_tag" && healthy || echo 'Rollback failed; intervention required.' >&2
  fi
  exit 1
fi
ln -sfn "$release_dir" "$BACKEND_RELEASE_ROOT/current"
echo "Backend $environment deployment succeeded: $release_id"
