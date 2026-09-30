#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
temp_dir="$(cd "$(mktemp -d)" && pwd -P)"
trap 'rm -rf "${temp_dir}"' EXIT

root="${temp_dir}/state"
bin="${temp_dir}/bin"
project="${temp_dir}/project"
old_release="${root}/releases/old"
mkdir -p "${bin}" "${old_release}" "${root}/secrets" "${project}/infra"
cp -R "${repo_root}/infra/observability" "${project}/infra/observability"
sed "s|^root=/opt/jumin-observability$|root=${root}|" \
  "${repo_root}/infra/observability/scripts/deploy.sh" \
  > "${project}/infra/observability/scripts/deploy.sh"
chmod +x "${project}/infra/observability/scripts/deploy.sh"

printf 'test\n' > "${root}/secrets/ingest_htpasswd"
printf 'test\n' > "${root}/secrets/admin_password"
printf 'test\n' > "${root}/secrets/discord_webhook_url"
touch "${old_release}/compose.yml"
ln -s "${old_release}" "${root}/current"

cat > "${bin}/mountpoint" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK

cat > "${bin}/sudo" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK

cat > "${bin}/docker" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${DOCKER_CALL_LOG}"
exit 0
MOCK

cat > "${bin}/curl" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${CURL_CALL_LOG}"
printf '{"database":"ok"}\n'
MOCK

cat > "${bin}/readlink" <<'MOCK'
#!/usr/bin/env bash
if [[ "${1:-}" == '-f' ]]; then
  python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$2"
else
  exec /usr/bin/readlink "$@"
fi
MOCK

cat > "${bin}/mv" <<'MOCK'
#!/usr/bin/env bash
destination=''
for argument in "$@"; do destination="${argument}"; done
if [[ "${destination}" == "${OBSERVABILITY_ROOT}/current" ]]; then
  exit 1
fi
exec /usr/bin/mv "$@"
MOCK

chmod +x "${bin}"/*
export DOCKER_CALL_LOG="${temp_dir}/docker-calls.log"
export CURL_CALL_LOG="${temp_dir}/curl-calls.log"
export OBSERVABILITY_ROOT="${root}"

set +e
PATH="${bin}:${PATH}" \
GITHUB_SHA=probe GITHUB_RUN_ID=42 GITHUB_RUN_ATTEMPT=1 \
  "${project}/infra/observability/scripts/deploy.sh" \
  > "${temp_dir}/deploy.log" 2>&1
status=$?
set -e

if [[ "${status}" -ne 1 ]]; then
  cat "${temp_dir}/deploy.log" >&2
  echo "Expected deployment to fail after current-link replacement fails; got exit ${status}." >&2
  exit 1
fi

if [[ "$(readlink "${root}/current")" != "${old_release}" ]]; then
  cat "${temp_dir}/deploy.log" >&2
  echo 'The current symlink changed even though its atomic replacement failed.' >&2
  exit 1
fi

if ! grep -Fq "compose -f ${old_release}/compose.yml up --detach --force-recreate --remove-orphans --wait" \
    "${DOCKER_CALL_LOG}"; then
  cat "${DOCKER_CALL_LOG}" >&2
  echo 'The previous release Compose file was not restarted.' >&2
  exit 1
fi

if [[ "$(wc -l < "${CURL_CALL_LOG}" | tr -d ' ')" -ne 2 ]]; then
  cat "${CURL_CALL_LOG}" >&2
  echo 'Expected readiness checks for both the new and restored releases.' >&2
  exit 1
fi

if find "${root}" -maxdepth 1 -name 'current.next.*' -print -quit | grep -q .; then
  echo 'A temporary current symlink was left behind.' >&2
  exit 1
fi

echo 'Current-link replacement failure restores the previous release and fails deployment.'
