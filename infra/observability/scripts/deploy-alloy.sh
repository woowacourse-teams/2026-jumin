#!/usr/bin/env bash
set -Eeuo pipefail

environment="${1:-}"
[[ "${environment}" == dev || "${environment}" == prod ]] || {
  echo 'Usage: deploy-alloy.sh dev|prod' >&2
  exit 2
}
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../alloy" && pwd)"
root=/opt/jumin-alloy
test -s "${root}/ingest_password"
mkdir -p "${root}/data" "${root}/config"
if ! sudo -n chown -R 0:0 "${root}/data" || ! sudo -n chmod 0750 "${root}/data"; then
  echo 'Could not make the Alloy data directory writable by UID 0; the runner needs passwordless sudo.' >&2
  exit 1
fi
sed "s/__ENV__/${environment}/g" "${source_dir}/config.alloy.template" > "${root}/config/config.alloy"
cp "${source_dir}/compose.yml" "${root}/config/compose.yml"
docker compose -f "${root}/config/compose.yml" config --quiet
docker compose -f "${root}/config/compose.yml" up --detach --force-recreate --wait
