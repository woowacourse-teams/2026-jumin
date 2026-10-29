#!/usr/bin/env bash
set -Eeuo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
source "${root}/infra/scripts/viewport-cache-config.sh"
python3 "${root}/infra/scripts/tests/test-viewport-cache-smoke.py"
tmp="$(mktemp -d)"
runtime="${tmp}/runtime"
settings="${tmp}/settings.env"
mkdir -p "${runtime}"
cleanup() {
  if [[ -n "${VIEWPORT_TEST_IMAGE:-}" && -d "${runtime}" ]]; then
    docker run --rm --network none --user 0 --entrypoint /bin/sh \
      --mount "type=bind,source=${runtime},target=/fixture" "${VIEWPORT_TEST_IMAGE}" \
      -c 'chmod -R ugo+rwX /fixture' >/dev/null 2>&1 || true
  fi
  rm -rf "${tmp}"
}
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
expect_invalid() {
  if (viewport_load_config "$1" "${settings}" "${runtime}" "${2:-false}") >/dev/null 2>&1; then
    fail 'invalid settings were accepted'
  fi
}

viewport_load_config dev "${settings}" "${runtime}"
[[ "${JUMIN_VIEWPORT_CACHE_ENABLED}" == false && "${JUMIN_VIEWPORT_CACHE_PREPAREONSTARTUP}" == false ]] || fail 'missing settings must keep cache OFF'
[[ "${VIEWPORT_JAVA_TOOL_OPTIONS}" == '-Duser.timezone=Asia/Seoul' ]] || fail 'default JVM options changed'
mkdir "${tmp}/inaccessible"
chmod 000 "${tmp}/inaccessible"
if [[ "${EUID}" -ne 0 ]] && (viewport_load_config dev "${tmp}/inaccessible/settings.env" "${runtime}") >/dev/null 2>&1; then
  fail 'inaccessible settings directory was treated as absent'
fi
chmod 0755 "${tmp}/inaccessible"
ln -s "${tmp}" "${tmp}/settings-link"
if (viewport_load_config dev "${tmp}/settings-link/absent" "${runtime}") >/dev/null 2>&1; then
  fail 'symlinked settings directory was accepted'
fi

cat > "${settings}" <<'EOF'
ENABLED=true
REDIS_URI=rediss://10.0.100.241:6379
NAMESPACE=dev_sq_release_20261030
JAVA_TOOL_OPTIONS=-Duser.timezone=Asia/Seoul -XX:+UseG1GC -Xmx226m
EOF
viewport_load_config dev "${settings}" "${runtime}"
[[ "${JUMIN_VIEWPORT_CACHE_ENABLED}" == true && "${JUMIN_VIEWPORT_CACHE_PREPAREONSTARTUP}" == false ]] || fail 'enabled settings'
[[ "${VIEWPORT_CONFIG_IMPORT}" == 'configtree:/app/viewport-cache/' &&
   "${JUMIN_VIEWPORT_CACHE_REDISTLSCAFILE}" == '/app/viewport-cache/redis-server.pem' ]] || fail 'configtree and CA paths'
[[ "${VIEWPORT_JAVA_TOOL_OPTIONS}" == *'-XX:+UseG1GC -Xmx226m' ]] || fail 'explicit JVM options'
viewport_load_config dev "${settings}" "${runtime}" true
[[ "${JUMIN_VIEWPORT_CACHE_PREPAREONSTARTUP}" == true ]] || fail 'explicit one-time prepare'
expect_invalid prod

write_settings() {
  printf 'ENABLED=%s\nREDIS_URI=%s\nNAMESPACE=%s\n' "$1" "$2" "$3" > "${settings}"
}
for invalid_uri in 'redis://10.0.100.241:6379' 'rediss://user:password@host:6379' 'rediss://10.0.100.241:99999'; do
  write_settings true "${invalid_uri}" dev_sq_release_20261030
  expect_invalid dev
done
write_settings true rediss://10.0.100.241:6379 prod_sq_release_20261030
expect_invalid dev
write_settings maybe rediss://10.0.100.241:6379 dev_sq_release_20261030
expect_invalid dev
write_settings true rediss://10.0.100.241:6379 dev_sq_release_20261030
printf 'PREPARE_ON_STARTUP=true\n' >> "${settings}"
expect_invalid dev
write_settings true rediss://10.0.100.241:6379 dev_sq_release_20261030
printf 'JAVA_TOOL_OPTIONS=-Dsecret=do-not-log\n' >> "${settings}"
expect_invalid dev
write_settings true rediss://10.0.100.241:6379 dev_sq_release_20261030
printf 'ENABLED=true\n' >> "${settings}"
expect_invalid dev

write_settings true rediss://10.0.100.241:6379 '$(touch /tmp/unused)'
printf 'NAMESPACE=$(touch %s/should-not-execute)\n' "${tmp}" > "${tmp}/injection"
{ head -n 2 "${settings}"; cat "${tmp}/injection"; } > "${tmp}/malicious"
mv "${tmp}/malicious" "${settings}"
expect_invalid dev
[[ ! -e "${tmp}/should-not-execute" ]] || fail 'settings were executed as shell'

printf 'ENABLED=false\n' > "${settings}"
viewport_load_config prod "${settings}" "${runtime}"
[[ "${JUMIN_VIEWPORT_CACHE_ENABLED}" == false ]] || fail 'explicit OFF'
expect_invalid prod true

# Rollback is permitted only for the exact previously verified image ID.
marker="${tmp}/compatible-image-id"
image_id="sha256:$(printf '%064d' 1)"
printf '%s\n' "${image_id}" > "${marker}"
(
  # Host ownership is checked separately; this fixture tests image identity.
  viewport_verify_public_settings_owner() { return 0; }
  viewport_can_restore_image "${marker}" "${image_id}" "${image_id}" || fail 'matching image rejected'
  if viewport_can_restore_image "${marker}" "sha256:$(printf '%064d' 2)" "sha256:$(printf '%064d' 2)"; then
    fail 'unverified image accepted for rollback'
  fi
  if viewport_can_restore_image "${marker}" "${image_id}" "sha256:$(printf '%064d' 2)"; then
    fail 'retargeted image tag accepted for rollback'
  fi
  rm "${marker}"
  if viewport_can_restore_image "${marker}" "${image_id}" "${image_id}"; then
    fail 'missing marker accepted for rollback'
  fi
)

# Both environments on main use the client ID/secret search contract.
python3 - "${root}" <<'PY'
import os, subprocess, sys
root = sys.argv[1]
base = dict(PATH=os.environ['PATH'], GITHUB_WORKSPACE=root, GITHUB_SHA='invalid',
    GITHUB_RUN_ID='1', GITHUB_RUN_ATTEMPT='1', BACKEND_ARTIFACT_DIR='/unused',
    BACKEND_RELEASE_ROOT='/unused', BACKEND_PORT='8080', DB_URL='test', DB_USERNAME='test',
    DB_PASSWORD='test', REVERSE_GEOCODING_CLIENT_ID='test', REVERSE_GEOCODING_CLIENT_SECRET='test',
    ADMIN_LOGIN_ID='test', ADMIN_PASSWORD_HASH='test', ADMIN_TOKEN_SECRET='test', ADMIN_ENV_LABEL='test')
for target in ('dev', 'prod'):
    cmd = ['bash', root + '/infra/scripts/deploy-backend.sh', target]
    missing = subprocess.run(cmd, env=base, text=True, capture_output=True)
    assert missing.returncode != 0 and 'Missing local search credentials' in missing.stderr
    valid = dict(base, LOCAL_SEARCH_CLIENT_ID='test', LOCAL_SEARCH_CLIENT_SECRET='test')
    stopped = subprocess.run(cmd, env=valid, text=True, capture_output=True)
    assert stopped.returncode != 0 and 'Invalid release identity' in stopped.stderr
PY

# Compose rendering must mount files read-only only for the ON overlay, and never
# copy runtime credential values into container environment variables.
export DB_URL='jdbc:postgresql://localhost:5432/jumin' DB_USERNAME=ci DB_PASSWORD=ci
export LOCAL_SEARCH_CLIENT_ID=ci LOCAL_SEARCH_CLIENT_SECRET=ci
unset LOCAL_SEARCH_REST_API_KEY PARKING_AVAILABILITY_ENABLED SEOUL_PARKING_API_KEY BUSAN_PARKING_API_KEY
export REVERSE_GEOCODING_CLIENT_ID=ci REVERSE_GEOCODING_CLIENT_SECRET=ci
export ADMIN_LOGIN_ID=ci ADMIN_PASSWORD_HASH=ci ADMIN_TOKEN_SECRET=ci ADMIN_ENV_LABEL=ci
for environment in dev prod; do
  endpoint='10.0.100.241'
  [[ "${environment}" == dev ]] || endpoint='10.0.100.51'
  cat > "${settings}" <<EOF
ENABLED=true
REDIS_URI=rediss://${endpoint}:6379
NAMESPACE=${environment}_sq_release_20261030
EOF
  viewport_load_config "${environment}" "${settings}" "${runtime}"
  docker compose -f "${root}/infra/docker-compose.${environment}.yml" \
    -f "${root}/infra/docker-compose.viewport.yml" config --format json > "${tmp}/compose.json"
  python3 - "${tmp}/compose.json" "${runtime}" <<'PY'
import json, sys
config = json.load(open(sys.argv[1]))['services']['backend']
assert '10001' in [str(group) for group in config.get('group_add', [])]
env = config['environment']
assert env['JUMIN_VIEWPORT_CACHE_ENABLED'] == 'true'
assert env['JUMIN_VIEWPORT_CACHE_PREPAREONSTARTUP'] == 'false'
assert env['JUMIN_VIEWPORT_CACHE_VERSIONCHECKENABLED'] == 'false'
assert env['JUMIN_VIEWPORT_CACHE_MAXCONCURRENTREQUESTS'] == '0'
assert env['SPRING_CONFIG_IMPORT'] == 'configtree:/app/viewport-cache/'
assert not any(k in env for k in ('JUMIN_VIEWPORT_CACHE_REDISPASSWORD',
                                 'JUMIN_VIEWPORT_CACHE_READPASSWORD',
                                 'JUMIN_VIEWPORT_CACHE_OBSERVERPASSWORD'))
mounts = [v for v in config['volumes'] if v['target'] == '/app/viewport-cache']
assert len(mounts) == 1 and mounts[0]['source'] == sys.argv[2] and mounts[0]['read_only']
PY
  printf 'ENABLED=false\n' > "${settings}"
  viewport_load_config "${environment}" "${settings}" "${runtime}"
  docker compose -f "${root}/infra/docker-compose.${environment}.yml" config --format json > "${tmp}/compose.json"
  python3 - "${tmp}/compose.json" <<'PY'
import json, sys
config = json.load(open(sys.argv[1]))['services']['backend']
assert config['environment']['JUMIN_VIEWPORT_CACHE_ENABLED'] == 'false'
assert not any(v['target'] == '/app/viewport-cache' for v in config.get('volumes', []))
PY
done

if [[ -n "${VIEWPORT_TEST_IMAGE:-}" ]]; then
  chmod 0755 "${tmp}"
  docker run --rm --network none --user 0 --entrypoint /bin/sh \
    --mount "type=bind,source=${runtime},target=/fixture" "${VIEWPORT_TEST_IMAGE}" -ec '
      chown 0:10001 /fixture
      chmod 0750 /fixture
      for file in jumin.viewport.cache.redis-username jumin.viewport.cache.redis-password \
                  jumin.viewport.cache.read-username jumin.viewport.cache.read-password \
                  jumin.viewport.cache.observer-username jumin.viewport.cache.observer-password \
                  redis-server.pem; do
        printf fixture > "/fixture/$file"
        chown 0:10001 "/fixture/$file"
        chmod 0440 "/fixture/$file"
      done'
  export VIEWPORT_RUNTIME_DIR="${runtime}"
  viewport_check_runtime "${VIEWPORT_TEST_IMAGE}" || fail 'valid runtime not readable as app user'
  docker run --rm --network none --user 0 --entrypoint /bin/sh \
    --mount "type=bind,source=${runtime},target=/fixture" "${VIEWPORT_TEST_IMAGE}" \
    -c 'chmod 0444 /fixture/jumin.viewport.cache.redis-password'
  if viewport_check_runtime "${VIEWPORT_TEST_IMAGE}" >/dev/null 2>&1; then
    fail 'world-readable runtime credential accepted'
  fi
  docker run --rm --network none --user 0 --entrypoint /bin/sh \
    --mount "type=bind,source=${runtime},target=/fixture" "${VIEWPORT_TEST_IMAGE}" \
    -c 'rm /fixture/jumin.viewport.cache.redis-password'
  if viewport_check_runtime "${VIEWPORT_TEST_IMAGE}" >/dev/null 2>&1; then
    fail 'missing runtime credential accepted'
  fi
fi
echo 'Viewport deployment contracts passed.'
