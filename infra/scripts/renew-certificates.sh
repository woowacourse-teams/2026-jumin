#!/usr/bin/env bash

set -Eeuo pipefail

current_release="/opt/jumin-dev/proxy/current"
compose_file="${JUMIN_DEV_PROXY_COMPOSE_FILE:-${current_release}/docker-compose.proxy.yml}"
current_config="${JUMIN_DEV_PROXY_CONFIG_FILE:-${current_release}/jumin.conf}"

test -f "${compose_file}"
test -f "${current_config}"

NGINX_CONF_FILE="${current_config}" \
  docker compose \
  --project-name jumin-proxy \
  --file "${compose_file}" \
  run --rm certbot renew --quiet

NGINX_CONF_FILE="${current_config}" \
  docker compose \
  --project-name jumin-proxy \
  --file "${compose_file}" \
  exec --no-TTY nginx nginx -s reload
