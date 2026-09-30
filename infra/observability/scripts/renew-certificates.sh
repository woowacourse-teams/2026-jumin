#!/usr/bin/env bash
set -Eeuo pipefail

current_release=/opt/jumin-observability/current
compose_file="${current_release}/compose.yml"
config_file="${current_release}/nginx/grafana.conf"

test -f "${compose_file}"
test -f "${config_file}"

NGINX_CONF_FILE="${config_file}" \
  docker compose --file "${compose_file}" run --rm certbot renew --quiet

NGINX_CONF_FILE="${config_file}" \
  docker compose --file "${compose_file}" exec --no-TTY nginx nginx -t

NGINX_CONF_FILE="${config_file}" \
  docker compose --file "${compose_file}" exec --no-TTY nginx nginx -s reload
