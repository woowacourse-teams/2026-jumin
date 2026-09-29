#!/usr/bin/env bash
set -Eeuo pipefail

root=/opt/jumin-observability
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
release="${root}/releases/${GITHUB_SHA:-manual}-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
current="${root}/current"
previous_release=''
current_next="${current}.next.${GITHUB_RUN_ID:-local}.${GITHUB_RUN_ATTEMPT:-1}.$$"
trap 'rm -f "${current_next}"' EXIT

if [[ -e "${current}" || -L "${current}" ]]; then
  [[ -L "${current}" ]] || { echo 'Observability current release is not a symlink.' >&2; exit 1; }
  previous_release="$(readlink -f "${current}")" || {
    echo 'Could not resolve the current observability release.' >&2
    exit 1
  }
  [[ -d "${previous_release}" && -f "${previous_release}/compose.yml" ]] || {
    echo 'Current observability release is missing its compose.yml; refusing deployment.' >&2
    exit 1
  }
fi

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

wait_for_readiness() {
  local compose_file="$1"
  for _ in {1..24}; do
    if curl --noproxy '*' --fail --silent --show-error --max-time 5 \
        --resolve grafana.jucha.info:443:127.0.0.1 \
        https://grafana.jucha.info/api/health | grep -Eq '"database"[[:space:]]*:[[:space:]]*"ok"' &&
      docker compose -f "${compose_file}" exec -T nginx \
        wget -q -T 5 -O /dev/null http://loki:3100/ready &&
      docker compose -f "${compose_file}" exec -T nginx \
        wget -q -T 5 -O /dev/null http://prometheus:9090/-/ready; then
      return 0
    fi
    sleep 5
  done
  echo "Readiness check failed for ${compose_file}." >&2
  return 1
}

rollback_previous_release() {
  if [[ -z "${previous_release}" ]]; then
    echo 'No previous observability release is available for rollback.' >&2
    return 1
  fi

  echo 'Attempting to restore the previous observability release.' >&2
  if docker compose -f "${previous_release}/compose.yml" \
      up --detach --force-recreate --remove-orphans --wait &&
    wait_for_readiness "${previous_release}/compose.yml"; then
    echo 'Previous observability release restored; this deployment remains failed.' >&2
    return 0
  fi

  echo 'Previous observability release rollback failed; manual intervention is required.' >&2
  return 1
}

if docker compose -f "${release}/compose.yml" up --detach --force-recreate --remove-orphans --wait &&
  wait_for_readiness "${release}/compose.yml"; then
  if ln -s "${release}" "${current_next}" && mv -Tf "${current_next}" "${current}"; then
    echo 'Observability deployment healthy.'
    exit 0
  fi

  echo 'New observability release is healthy, but updating the current symlink failed.' >&2
  rollback_previous_release || true
  exit 1
fi

echo 'New observability release failed.' >&2
rollback_previous_release || true
exit 1
