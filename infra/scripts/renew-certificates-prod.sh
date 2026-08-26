#!/usr/bin/env bash

set -Eeuo pipefail

current_release="/opt/jumin-prod/proxy/current"
compose_file="${JUMIN_PROD_PROXY_COMPOSE_FILE:-${current_release}/docker-compose.proxy.prod.yml}"
current_config="/opt/jumin-prod/proxy/current/jumin.prod.conf"

test -f "${compose_file}"
test -f "${current_config}"

NGINX_CONF_FILE="${current_config}" \
  docker compose \
    --project-name jumin-proxy-prod \
    --file "${compose_file}" \
    run --rm certbot renew --quiet

NGINX_CONF_FILE="${current_config}" \
  docker compose \
    --project-name jumin-proxy-prod \
    --file "${compose_file}" \
    exec --no-TTY nginx nginx -t

NGINX_CONF_FILE="${current_config}" \
  docker compose \
    --project-name jumin-proxy-prod \
    --file "${compose_file}" \
    exec --no-TTY nginx nginx -s reload
