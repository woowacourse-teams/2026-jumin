#!/usr/bin/env bash
set +x
set -Eeuo pipefail
environment="${1:-}"
redis_host="${2:-}"
[[ $# -eq 2 && ( "$environment" == dev || "$environment" == prod ) && "$redis_host" =~ ^[A-Za-z0-9.-]+$ ]] || exit 2
cd "/opt/jumin-redis-$environment"
for file in compose.yaml redis.conf runtime/server.crt runtime/server.key runtime/users.acl secrets/admin.secret; do
  [[ -s "$file" ]] || { echo "Missing Redis bootstrap file: $file" >&2; exit 1; }
done
exec 9>.redis-deploy.lock
flock -n 9 || { echo 'Another Redis deployment is active.' >&2; exit 1; }
override=ci-compose.override.yml
previous="$(mktemp .redis-compose-previous.XXXXXX)"
had_override=false
if [[ -f "$override" ]]; then cp "$override" "$previous"; had_override=true; fi
trap 'rm -f "$previous"' EXIT
cat > "$override" <<'YAML'
services:
  redis:
    image: redis:7.4.12-bookworm@sha256:70906c24c6bcde0712573cce29bb3d30331fec36aaefd503bc570c18ba431c26
YAML
compose=(docker compose --project-name "jumin-redis-$environment" --file compose.yaml --file "$override")
probe() {
  for _ in $(seq 1 12); do
    if "${compose[@]}" exec --user 0 -T redis sh -ec 'export REDISCLI_AUTH="$(cat /run/secrets/admin.secret)"; exec redis-cli --tls --cacert /run/redis/server.crt --user admin -h "$1" PING' sh "$redis_host" | grep -qx PONG; then return 0; fi
    sleep 2
  done
  return 1
}
if ! "${compose[@]}" pull redis || ! "${compose[@]}" up --detach --no-deps redis || ! probe; then
  echo 'Redis deployment failed; restoring previous Compose configuration.' >&2
  if [[ "$had_override" == true ]]; then
    cp "$previous" "$override"
    "${compose[@]}" up --detach --no-deps redis || true
  else
    rm -f "$override"
    docker compose --project-name "jumin-redis-$environment" --file compose.yaml up --detach --no-deps redis || true
  fi
  exit 1
fi
echo "Redis $environment deployment and TLS PING succeeded."
