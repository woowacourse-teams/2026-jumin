#!/usr/bin/env bash

set -Eeuo pipefail

script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
infra_directory="$(cd -- "${script_directory}/.." && pwd)"
compose_file="${infra_directory}/docker-compose.proxy.yml"

docker compose \
  --project-name jumin-proxy \
  --file "${compose_file}" \
  run --rm certbot renew --quiet

docker compose \
  --project-name jumin-proxy \
  --file "${compose_file}" \
  exec --no-TTY nginx nginx -s reload
