#!/usr/bin/env bash
set +x
set -Eeuo pipefail

environment="${1:-}"
[[ $# -eq 1 && ( "${environment}" == dev || "${environment}" == prod ) ]] || {
  echo 'Usage: deploy-backend.sh dev|prod' >&2; exit 2;
}
repository_root="${GITHUB_WORKSPACE:-$PWD}"
source "${repository_root}/infra/scripts/viewport-cache-config.sh"

for variable in GITHUB_SHA GITHUB_RUN_ID GITHUB_RUN_ATTEMPT BACKEND_ARTIFACT_DIR BACKEND_RELEASE_ROOT \
  BACKEND_PORT DB_URL DB_USERNAME DB_PASSWORD REVERSE_GEOCODING_CLIENT_ID \
  REVERSE_GEOCODING_CLIENT_SECRET ADMIN_LOGIN_ID ADMIN_PASSWORD_HASH ADMIN_TOKEN_SECRET ADMIN_ENV_LABEL; do
  [[ -n "${!variable:-}" ]] || { echo "Missing required deployment variable: ${variable}" >&2; exit 1; }
done
[[ -n "${LOCAL_SEARCH_CLIENT_ID:-}" && -n "${LOCAL_SEARCH_CLIENT_SECRET:-}" ]] || {
  echo 'Missing local search credentials.' >&2; exit 1;
}
[[ "${GITHUB_SHA}" =~ ^[a-f0-9]{40}$ && "${GITHUB_RUN_ID}" =~ ^[0-9]+$ &&
   "${GITHUB_RUN_ATTEMPT}" =~ ^[0-9]+$ ]] || { echo 'Invalid release identity.' >&2; exit 1; }

# Manual operations must cooperate with this lock. Proxy CD is separate and
# must also be paused before a maintenance window is started.
mkdir -p "${BACKEND_RELEASE_ROOT}"
exec 9>>"${BACKEND_RELEASE_ROOT}/.viewport-deploy.lock"
flock -n 9 || { echo 'Another backend deployment or viewport operation is active.' >&2; exit 1; }

settings_dir="/opt/jumin-${environment}/viewport-cache"
settings_file="${settings_dir}/settings.env"
runtime_dir="${settings_dir}/runtime"
compatibility_marker="${settings_dir}/compatible-image-id"
viewport_verify_public_settings_owner "${settings_file}"
viewport_load_config "${environment}" "${settings_file}" "${runtime_dir}" false

if [[ "${environment}" == prod ]]; then
  release_id="${GITHUB_SHA:0:12}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
else
  release_id="${GITHUB_SHA}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
fi
release_dir="${BACKEND_RELEASE_ROOT}/releases/${release_id}"
current_link="${BACKEND_RELEASE_ROOT}/current"
image_name='jumin-backend'
container_name="jumin-backend-${environment}"
compose_project="jumin-${environment}"
compose_file="${repository_root}/infra/docker-compose.${environment}.yml"
compose_files=(--file "${compose_file}")
if [[ "${JUMIN_VIEWPORT_CACHE_ENABLED}" == true ]]; then
  compose_files+=(--file "${repository_root}/infra/docker-compose.viewport.yml")
fi

previous_image="$(docker inspect --format '{{.Config.Image}}' "${container_name}" 2>/dev/null || true)"
previous_id="$(docker inspect --format '{{.Image}}' "${container_name}" 2>/dev/null || true)"
previous_tag=''
if [[ -n "${previous_image}" ]]; then
  [[ "${previous_image}" == "${image_name}:"* ]] || {
    echo 'Unexpected existing backend image; refusing deployment.' >&2; exit 1;
  }
  previous_tag="${previous_image#${image_name}:}"
fi

test -s "${BACKEND_ARTIFACT_DIR}/app.jar"
if [[ -f "${BACKEND_ARTIFACT_DIR}/app.jar.sha256" ]]; then
  (cd "${BACKEND_ARTIFACT_DIR}" && sha256sum --check app.jar.sha256)
fi
test -f "${compose_file}"
mkdir -p "${release_dir}"
cp "${BACKEND_ARTIFACT_DIR}/app.jar" "${release_dir}/app.jar"
if [[ -f "${BACKEND_ARTIFACT_DIR}/app.jar.sha256" ]]; then
  cp "${BACKEND_ARTIFACT_DIR}/app.jar.sha256" "${release_dir}/app.jar.sha256"
fi
docker build --file "${repository_root}/server/Dockerfile" --build-arg "APP_COMMIT_SHA=${GITHUB_SHA}" \
  --tag "${image_name}:${release_id}" "${release_dir}"
built_image_id="$(docker image inspect --format '{{.Id}}' "${image_name}:${release_id}")"
[[ "${built_image_id}" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Could not verify the built backend image ID.' >&2; exit 1; }

# Validate mounted files as the actual container user before replacing the running backend.
if [[ "${JUMIN_VIEWPORT_CACHE_ENABLED}" == true ]]; then
  viewport_check_runtime "${image_name}:${release_id}"
fi

compose_up() {
  local image_tag="$1"
  IMAGE_TAG="${image_tag}" docker compose --project-name "${compose_project}" \
    "${compose_files[@]}" up --detach --no-deps --remove-orphans backend
}

wait_for_health() {
  local attempt
  for attempt in $(seq 1 12); do
    if curl --noproxy '*' --fail --silent --show-error --connect-timeout 2 --max-time 5 \
      "http://127.0.0.1:${BACKEND_PORT}/actuator/health" >/dev/null; then
      if [[ "${environment}" == dev ]] ||
        [[ "$(docker inspect --format '{{.State.Health.Status}}' "${container_name}" 2>/dev/null)" == healthy ]]; then
        return 0
      fi
    fi
    sleep 5
  done
  return 1
}

restore_compatible_previous() {
  local tagged_id=''
  if [[ -n "${previous_tag}" ]]; then
    tagged_id="$(docker image inspect --format '{{.Id}}' "${image_name}:${previous_tag}" 2>/dev/null || true)"
  fi
  if [[ -n "${previous_tag}" ]] &&
    viewport_can_restore_image "${compatibility_marker}" "${previous_id}" "${tagged_id}"; then
    echo 'Restoring the previously verified writer-compatible backend image.' >&2
    if compose_up "${previous_tag}" && wait_for_health; then
      echo 'Previously verified backend image is healthy again.' >&2
    else
      echo 'Restoring the verified backend image failed; operator intervention is required.' >&2
    fi
  else
    echo 'No matching verified writer-compatible image; automatic rollback is disabled.' >&2
  fi
}

if ! compose_up "${release_id}"; then
  echo 'Backend Compose deployment failed; container logs remain on the host.' >&2
  restore_compatible_previous
  exit 1
fi
if ! wait_for_health; then
  echo 'Backend health check failed; container logs remain on the host.' >&2
  restore_compatible_previous
  exit 1
fi
smoke_script="${repository_root}/infra/scripts/viewport-cache-smoke.sh"
if ! bash "${smoke_script}" identity "${container_name}" "${built_image_id}" "${GITHUB_SHA}"; then
  echo 'Running backend identity check failed.' >&2
  restore_compatible_previous
  exit 1
fi
if [[ "${JUMIN_VIEWPORT_CACHE_ENABLED}" == true ]]; then
  if ! bash "${smoke_script}" cache "${BACKEND_PORT}" ||
    ! bash "${smoke_script}" identity "${container_name}" "${built_image_id}" "${GITHUB_SHA}"; then
    echo 'Viewport cache smoke or backend identity check failed.' >&2
    restore_compatible_previous
    exit 1
  fi
fi
ln -sfn "${release_dir}" "${current_link}"
echo "Backend ${environment} deployment succeeded: ${release_id}"
