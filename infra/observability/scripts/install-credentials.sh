#!/usr/bin/env bash
set +x
set -Eeuo pipefail
umask 077

mode="${1:-}"
destination="${2:-}"
ingest_password="${OBSERVABILITY_INGEST_PASSWORD:-}"
[[ "$#" -eq 2 ]] || { echo 'Usage: install-credentials.sh central|collector DESTINATION' >&2; exit 2; }
[[ "${#ingest_password}" -ge 32 && "${ingest_password}" != *$'\n'* && "${ingest_password}" != *$'\r'* ]] || {
  echo 'OBSERVABILITY_INGEST_PASSWORD must be at least 32 characters on one line.' >&2
  exit 1
}

mkdir -p "${destination}"
chmod 0700 "${destination}"

write_secret() {
  local path="$1" value="$2" owner="${3:-}"
  local temporary
  [[ ! -L "${path}" ]] || { echo "Refusing symlink: ${path}" >&2; return 1; }
  temporary="$(mktemp "${path}.tmp.XXXXXX")"
  printf '%s' "${value}" > "${temporary}"
  chmod 0400 "${temporary}"
  if [[ -n "${owner}" ]]; then
    sudo -n chown "${owner}" "${temporary}" || { rm -f "${temporary}"; return 1; }
  fi
  mv -f "${temporary}" "${path}"
}

case "${mode}" in
  central)
    admin_password="${GRAFANA_ADMIN_PASSWORD:-}"
    discord_webhook="${DISCORD_WEBHOOK_URL:-}"
    [[ "${#admin_password}" -ge 32 && -n "${discord_webhook}" && "${discord_webhook}" != *$'\n'* ]] || {
      echo 'Missing Grafana administrator password or Discord webhook URL.' >&2
      exit 1
    }
    hash="$(printf '%s\n' "${ingest_password}" | docker run --rm -i \
      --entrypoint openssl certbot/certbot:v5.7.0 passwd -apr1 -stdin)"
    write_secret "${destination}/admin_password" "${admin_password}" 472:0
    write_secret "${destination}/discord_webhook_url" "${discord_webhook}" 472:0
    temporary="$(mktemp "${destination}/ingest_htpasswd.tmp.XXXXXX")"
    printf 'alloy:%s\n' "${hash}" > "${temporary}"
    chmod 0444 "${temporary}"
    mv -f "${temporary}" "${destination}/ingest_htpasswd"
    ;;
  collector)
    write_secret "${destination}/ingest_password" "${ingest_password}"
    chmod 0444 "${destination}/ingest_password"
    ;;
  *) echo "Unknown credential mode: ${mode}" >&2; exit 2 ;;
esac
