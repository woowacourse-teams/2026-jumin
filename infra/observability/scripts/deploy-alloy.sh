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
sed "s/__ENV__/${environment}/g" "${source_dir}/config.alloy.template" > "${root}/config/config.alloy"
cp "${source_dir}/compose.yml" "${root}/config/compose.yml"
docker compose -f "${root}/config/compose.yml" config --quiet
docker compose -f "${root}/config/compose.yml" up --detach --force-recreate --wait
