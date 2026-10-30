#!/usr/bin/env bash
set +x
set -Eeuo pipefail
environment="${1:-}"
[[ $# -eq 1 && ( "$environment" == dev || "$environment" == prod ) ]] || exit 2
redis_uri="${VIEWPORT_REDIS_URI:-}"
case "$redis_uri" in
  rediss://*:6379|rediss://*:6379/) ;;
  *) echo 'VIEWPORT_REDIS_URI must be a credential-free rediss endpoint on port 6379.' >&2; exit 2 ;;
esac
redis_host="${redis_uri#rediss://}"
redis_host="${redis_host%/}"
redis_host="${redis_host%:6379}"
[[ "$redis_host" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || {
  echo 'VIEWPORT_REDIS_URI must contain only a DNS name or IPv4 address.' >&2
  exit 2
}
for variable in REDIS_ARTIFACT_DIR GITHUB_SHA GITHUB_RUN_ID GITHUB_RUN_ATTEMPT; do
  [[ -n "${!variable:-}" ]] || { echo "Missing deployment setting: $variable" >&2; exit 1; }
done
[[ "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ && "$GITHUB_RUN_ID" =~ ^[0-9]+$ && "$GITHUB_RUN_ATTEMPT" =~ ^[0-9]+$ ]] || exit 1
artifact_dir="$(cd "$REDIS_ARTIFACT_DIR" && pwd)"
for file in Dockerfile deploy.sh redis-artifact.sha256; do
  [[ -s "$artifact_dir/$file" ]] || { echo "Missing Redis artifact file: $file" >&2; exit 1; }
done
if ! (cd "$artifact_dir" && sha256sum Dockerfile deploy.sh | cmp -s - redis-artifact.sha256); then
  echo 'Redis artifact manifest must match Dockerfile and deploy.sh.' >&2
  exit 1
fi
cd "${REDIS_DEPLOY_ROOT:-/opt/jumin-redis-$environment}"
for file in compose.yaml redis.conf runtime/server.crt runtime/server.key runtime/users.acl secrets/admin.secret; do
  [[ -s "$file" ]] || { echo "Missing Redis bootstrap file: $file" >&2; exit 1; }
done
exec 9>.redis-deploy.lock
flock -n 9 || { echo 'Another Redis deployment is active.' >&2; exit 1; }
image="jumin-redis:${GITHUB_SHA}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
docker build --file "$artifact_dir/Dockerfile" --build-arg "REDIS_COMMIT_SHA=$GITHUB_SHA" --tag "$image" "$artifact_dir"
override=ci-compose.override.yml
previous="$(mktemp .redis-compose-previous.XXXXXX)"
had_override=false
if [[ -f "$override" ]]; then cp "$override" "$previous"; had_override=true; fi
deployment_succeeded=false
restore_previous() {
  if [[ "$had_override" == true ]]; then
    cp "$previous" "$override" || return 1
    "${compose[@]}" up --detach --no-deps redis
    return
  fi
  rm -f "$override" || return 1
  docker compose --project-name "jumin-redis-$environment" --file compose.yaml up --detach --no-deps redis
}
finish_deployment() {
  local exit_status=$?
  trap - EXIT HUP INT TERM
  if [[ "$deployment_succeeded" == true ]]; then
    rm -f "$previous"
    exit "$exit_status"
  fi
  echo 'Redis deployment failed; restoring previous Compose configuration.' >&2
  if restore_previous; then
    rm -f "$previous"
  else
    echo "Redis rollback failed; preserve the previous configuration at $previous for recovery." >&2
  fi
  exit "$exit_status"
}
compose=(docker compose --project-name "jumin-redis-$environment" --file compose.yaml --file "$override")
trap finish_deployment EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
cat > "$override" <<YAML
services:
  redis:
    image: $image
    pull_policy: never
YAML
probe() {
  for _ in $(seq 1 12); do
    if "${compose[@]}" exec --user 0 -T redis sh -ec 'export REDISCLI_AUTH="$(cat /run/secrets/admin.secret)"; exec redis-cli --tls --cacert /run/redis/server.crt --user admin -h "$1" PING' sh "$redis_host" | grep -qx PONG; then return 0; fi
    sleep 2
  done
  return 1
}
if ! "${compose[@]}" up --detach --no-deps redis || ! probe; then
  exit 1
fi
deployment_succeeded=true
echo "Redis $environment deployment and TLS PING succeeded."
