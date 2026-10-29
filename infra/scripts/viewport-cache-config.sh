#!/usr/bin/env bash
# Source this file; the settings file contains only public, strictly parsed values.

viewport_load_config() {
  local environment="$1" settings_file="$2" runtime_dir="$3" prepare_once="${4:-false}"
  local line key value line_number=0 seen=' ' enabled='' redis_uri='' namespace='' java_options=''
  local token port

  [[ "${environment}" == dev || "${environment}" == prod ]] || {
    echo 'Invalid viewport environment.' >&2; return 1;
  }
  [[ "${prepare_once}" == false || "${prepare_once}" == true ]] || {
    echo 'Invalid one-time prepare mode.' >&2; return 1;
  }

  export VIEWPORT_RUNTIME_DIR="${runtime_dir}"
  export VIEWPORT_CONFIG_IMPORT='optional:configtree:/app/viewport-cache/'
  export VIEWPORT_JAVA_TOOL_OPTIONS='-Duser.timezone=Asia/Seoul'
  export JUMIN_VIEWPORT_CACHE_ENABLED=false
  export JUMIN_VIEWPORT_CACHE_ENVIRONMENT="${environment}_sq_disabled"
  export JUMIN_VIEWPORT_CACHE_REDISURI='redis://127.0.0.1:56379'
  export JUMIN_VIEWPORT_CACHE_REDISTLSCAFILE=''
  export JUMIN_VIEWPORT_CACHE_PREPAREONSTARTUP=false

  local settings_parent
  settings_parent="$(dirname "${settings_file}")"
  if [[ -e "${settings_parent}" || -L "${settings_parent}" ]]; then
    [[ -d "${settings_parent}" && ! -L "${settings_parent}" && -x "${settings_parent}" ]] || {
      echo 'Viewport settings directory is inaccessible or is a symlink.' >&2; return 1;
    }
  fi
  if [[ ! -e "${settings_file}" && ! -L "${settings_file}" ]]; then
    [[ "${prepare_once}" == false ]] || {
      echo 'One-time prepare requires enabled viewport settings.' >&2; return 1;
    }
    return 0
  fi
  [[ -f "${settings_file}" && ! -L "${settings_file}" && -r "${settings_file}" ]] || {
    echo 'Viewport settings must be a readable regular file, not a symlink.' >&2; return 1;
  }

  while IFS= read -r line || [[ -n "${line}" ]]; do
    ((line_number += 1))
    [[ -z "${line}" || "${line}" == \#* ]] && continue
    [[ "${line}" == *=* ]] || { echo "Invalid viewport settings line ${line_number}." >&2; return 1; }
    key="${line%%=*}"
    value="${line#*=}"
    case "${key}" in ENABLED|REDIS_URI|NAMESPACE|JAVA_TOOL_OPTIONS) ;; *)
      echo "Unknown viewport settings key on line ${line_number}." >&2; return 1 ;;
    esac
    [[ "${seen}" != *" ${key} "* ]] || { echo "Duplicate viewport setting ${key}." >&2; return 1; }
    seen+="${key} "
    case "${key}" in
      ENABLED) enabled="${value}" ;;
      REDIS_URI) redis_uri="${value}" ;;
      NAMESPACE) namespace="${value}" ;;
      JAVA_TOOL_OPTIONS) java_options="${value}" ;;
    esac
  done < "${settings_file}"

  [[ "${enabled}" == true || "${enabled}" == false ]] || {
    echo 'Viewport ENABLED must be true or false.' >&2; return 1;
  }
  if [[ -n "${java_options}" ]]; then
    # A small public allowlist avoids passing secrets or arbitrary shell/JVM options.
    [[ "${java_options}" != *$'\n'* && "${java_options}" != *$'\r'* ]] || return 1
    local -a options
    read -r -a options <<< "${java_options}"
    [[ ${#options[@]} -gt 0 ]] || { echo 'Viewport JAVA_TOOL_OPTIONS is blank.' >&2; return 1; }
    for token in "${options[@]}"; do
      [[ "${token}" =~ ^-Xm[sx][0-9]+[kKmMgG]?$ ||
         "${token}" =~ ^-XX:[+-][A-Za-z][A-Za-z0-9]*$ ||
         "${token}" =~ ^-XX:[A-Za-z][A-Za-z0-9]*=[0-9]+([.][0-9]+)?$ ||
         "${token}" == '-Duser.timezone=Asia/Seoul' ]] || {
        echo 'Unsupported viewport JAVA_TOOL_OPTIONS value.' >&2; return 1;
      }
    done
    export VIEWPORT_JAVA_TOOL_OPTIONS="${java_options}"
  fi
  if [[ "${enabled}" == false ]]; then
    [[ "${prepare_once}" == false ]] || {
      echo 'One-time prepare requires enabled viewport settings.' >&2; return 1;
    }
    return 0
  fi
  [[ "${redis_uri}" =~ ^rediss://[A-Za-z0-9.-]+:[0-9]{1,5}$ ]] || {
    echo 'Viewport REDIS_URI must be a credential-free rediss host and port.' >&2; return 1;
  }
  port="${redis_uri##*:}"
  ((10#${port} >= 1 && 10#${port} <= 65535)) || {
    echo 'Viewport REDIS_URI port is outside the valid range.' >&2; return 1;
  }
  [[ "${namespace}" =~ ^${environment}_sq_[A-Za-z0-9_-]+$ && ${#namespace} -le 48 ]] || {
    echo 'Viewport NAMESPACE must be a valid environment-specific square namespace.' >&2; return 1;
  }
  [[ -d "${runtime_dir}" && ! -L "${runtime_dir}" ]] || {
    echo 'Viewport runtime directory is missing or is a symlink.' >&2; return 1;
  }
  export VIEWPORT_CONFIG_IMPORT='configtree:/app/viewport-cache/'
  export JUMIN_VIEWPORT_CACHE_ENABLED=true
  export JUMIN_VIEWPORT_CACHE_ENVIRONMENT="${namespace}"
  export JUMIN_VIEWPORT_CACHE_REDISURI="${redis_uri}"
  export JUMIN_VIEWPORT_CACHE_REDISTLSCAFILE='/app/viewport-cache/redis-server.pem'
  export JUMIN_VIEWPORT_CACHE_PREPAREONSTARTUP="${prepare_once}"
}

viewport_verify_public_settings_owner() {
  local settings_file="$1"
  [[ ! -e "${settings_file}" && ! -L "${settings_file}" ]] && return 0
  python3 - "${settings_file}" <<'PY'
import os, stat, sys
path = sys.argv[1]
try:
    parent = os.stat(os.path.dirname(path), follow_symlinks=False)
    file = os.stat(path, follow_symlinks=False)
    good = (stat.S_ISDIR(parent.st_mode) and stat.S_ISREG(file.st_mode)
            and parent.st_uid == 0 and file.st_uid == 0
            and not (parent.st_mode & 0o022) and not (file.st_mode & 0o022))
except OSError:
    good = False
if not good:
    print('Viewport settings and directory must be root-owned and not group/world-writable.', file=sys.stderr)
    sys.exit(1)
PY
}

viewport_check_runtime() {
  local image="$1"
  docker run --rm --network none --group-add 10001 \
    --mount "type=bind,source=${VIEWPORT_RUNTIME_DIR},target=/app/viewport-cache,readonly" \
    --entrypoint /bin/sh "${image}" -ec '
      if [ "$(id -u)" != 10001 ]; then
        echo "Backend image must run as UID 10001." >&2
        exit 1
      fi
      dir=/app/viewport-cache
      dir_mode=$(stat -c %a "$dir")
      if [ "$(stat -c %u "$dir")" != 0 ] || [ $((0$dir_mode & 0027)) -ne 0 ]; then
        echo "Viewport runtime directory must be root-owned and protected." >&2
        exit 1
      fi
      for file in jumin.viewport.cache.redis-username jumin.viewport.cache.redis-password \
                  jumin.viewport.cache.read-username jumin.viewport.cache.read-password \
                  jumin.viewport.cache.observer-username jumin.viewport.cache.observer-password \
                  redis-server.pem; do
        path="$dir/$file"
        if [ -L "$path" ] || [ ! -f "$path" ] || [ ! -r "$path" ] || [ ! -s "$path" ]; then
          echo "Required viewport runtime file is missing or unreadable: $file" >&2
          exit 1
        fi
        mode=$(stat -c %a "$path")
        mask=0037
        [ "$file" != redis-server.pem ] || mask=0022
        if [ "$(stat -c %u "$path")" != 0 ] || [ $((0$mode & 0$mask)) -ne 0 ]; then
          echo "Viewport runtime file has unsafe ownership or permissions: $file" >&2
          exit 1
        fi
      done'
}

viewport_image_is_compatible() {
  local marker="$1" image_id="$2" recorded=''
  [[ "${image_id}" =~ ^sha256:[a-f0-9]{64}$ ]] || return 1
  [[ -f "${marker}" && ! -L "${marker}" && -r "${marker}" ]] || return 1
  viewport_verify_public_settings_owner "${marker}" || return 1
  IFS= read -r recorded < "${marker}" || [[ -n "${recorded}" ]] || return 1
  [[ "${recorded}" == "${image_id}" ]]
}

viewport_can_restore_image() {
  local marker="$1" previous_id="$2" tagged_id="$3"
  [[ "${tagged_id}" == "${previous_id}" ]] && viewport_image_is_compatible "${marker}" "${previous_id}"
}
