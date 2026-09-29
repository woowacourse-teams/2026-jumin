#!/usr/bin/env bash
set -Eeuo pipefail

root=/opt/jumin-observability
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
release="${root}/releases/${GITHUB_SHA:-manual}-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"

mountpoint -q /mnt/jumin-loki || { echo 'Loki EBS is not mounted.' >&2; exit 1; }
test -s "${root}/secrets/ingest_htpasswd"
test -s "${root}/secrets/admin_password"
test -s "${root}/secrets/discord_webhook_url"
mkdir -p "${root}/releases" "${root}/data/grafana" "${root}/data/prometheus"
sudo -n chown 472:0 "${root}/data/grafana"
sudo -n chown 65534:65534 "${root}/data/prometheus"
sudo -n chown 10001:10001 /mnt/jumin-loki
mkdir "${release}"
cp -R "${source_dir}/." "${release}/"

docker compose -f "${release}/compose.yml" config --quiet
docker compose -f "${release}/compose.yml" run --rm --no-deps nginx nginx -t
docker compose -f "${release}/compose.yml" up --detach --force-recreate --remove-orphans --wait

for _ in {1..24}; do
  if curl --noproxy '*' --fail --silent --show-error --max-time 5 \
    --resolve grafana.jucha.info:443:127.0.0.1 \
    https://grafana.jucha.info/api/health | grep -Eq '"database"[[:space:]]*:[[:space:]]*"ok"' &&
    docker compose -f "${release}/compose.yml" exec -T nginx \
      wget -q -T 5 -O /dev/null http://loki:3100/ready &&
    docker compose -f "${release}/compose.yml" exec -T nginx \
      wget -q -T 5 -O /dev/null http://prometheus:9090/-/ready; then
    ln -sfn "${release}" "${root}/current"
    echo 'Observability deployment healthy.'
    exit 0
  fi
  sleep 5
done
echo 'Grafana HTTPS, Loki, or Prometheus readiness check failed; inspect docker compose logs.' >&2
exit 1
