#!/usr/bin/env bash
set +x
set -Eeuo pipefail
umask 022

environment="${1:-}"
[[ $# -eq 2 && ( "${environment}" == dev || "${environment}" == prod ) &&
   "${2:-}" == --verified-writer-schema-compatible ]] || {
  echo 'Usage: sudo mark-viewport-compatible-image.sh dev|prod --verified-writer-schema-compatible' >&2
  exit 2
}
[[ "${EUID}" -eq 0 ]] || { echo 'A root-owned compatibility marker is required.' >&2; exit 1; }
container_name="jumin-backend-${environment}"
cache_disabled="$(docker inspect --format '{{range .Config.Env}}{{if eq . "JUMIN_VIEWPORT_CACHE_ENABLED=false"}}yes{{end}}{{end}}' "${container_name}")"
[[ "${cache_disabled}" == yes ]] || {
  echo 'The verified compatibility marker must be recorded while the cache is OFF.' >&2; exit 1;
}
image_id="$(docker inspect --format '{{.Image}}' "${container_name}")"
[[ "${image_id}" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Invalid running image ID.' >&2; exit 1; }
root="/opt/jumin-${environment}/viewport-cache"
if [[ ! -d "${root}" ]]; then
  install -d -o root -g root -m 0755 "${root}"
fi
[[ ! -L "${root}" ]] || { echo 'Refusing compatibility directory symlink.' >&2; exit 1; }
marker="${root}/compatible-image-id"
[[ ! -L "${marker}" ]] || { echo 'Refusing compatibility marker symlink.' >&2; exit 1; }
temporary="$(mktemp "${root}/.compatible-image-id.XXXXXX")"
trap 'rm -f "${temporary}"' EXIT
printf '%s\n' "${image_id}" > "${temporary}"
chmod 0644 "${temporary}"
mv -f "${temporary}" "${marker}"
echo 'Recorded the running writer-compatible image ID.'
