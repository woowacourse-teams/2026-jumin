#!/usr/bin/env bash
set -Eeuo pipefail

environment="${1:-}"
[[ "${environment}" == dev || "${environment}" == prod ]] || {
  echo 'Usage: deploy-alloy.sh dev|prod' >&2
  exit 2
}
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../alloy" && pwd)"
backend_port=8080
backend_journal_matches="CONTAINER_NAME=jumin-backend-${environment}"
if [[ "${environment}" == prod ]]; then
  backend_port=18080
  backend_journal_matches+=' CONTAINER_NAME=jumin-backend-prod-blue CONTAINER_NAME=jumin-backend-prod-green'
fi
root=/opt/jumin-alloy
test -s "${root}/ingest_password"
mkdir -p "${root}/data" "${root}/config"
if ! sudo -n chown -R 0:0 "${root}/data" || ! sudo -n chmod 0750 "${root}/data"; then
  echo 'Could not make the Alloy data directory writable by UID 0; the runner needs passwordless sudo.' >&2
  exit 1
fi
sed -e "s/__ENV__/${environment}/g" \
  -e "s/__BACKEND_PORT__/${backend_port}/g" \
  -e "s/__BACKEND_JOURNAL_MATCHES__/${backend_journal_matches}/g" \
  "${source_dir}/config.alloy.template" > "${root}/config/config.alloy"
cp "${source_dir}/compose.yml" "${root}/config/compose.yml"
docker compose -f "${root}/config/compose.yml" config --quiet
docker compose -f "${root}/config/compose.yml" up --detach --force-recreate --wait
