#!/usr/bin/env bash
set -Eeuo pipefail

repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)"
image="${NGINX_TEST_IMAGE:-nginx:1.30.4-alpine}"
temporary_directory="$(mktemp -d)"
current_network=""
current_backend=""
current_proxy=""

cleanup() {
    if [[ -n "${current_proxy}" ]]; then
        docker rm --force "${current_proxy}" >/dev/null 2>&1 || true
    fi
    if [[ -n "${current_backend}" ]]; then
        docker rm --force "${current_backend}" >/dev/null 2>&1 || true
    fi
    if [[ -n "${current_network}" ]]; then
        docker network rm "${current_network}" >/dev/null 2>&1 || true
    fi
    rm -rf "${temporary_directory}"
}
trap cleanup EXIT

if ! docker image inspect "${image}" >/dev/null 2>&1; then
    docker pull "${image}"
fi

openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "${temporary_directory}/health-test.key" \
    -out "${temporary_directory}/health-test.crt" \
    -subj '/CN=jucha.info' >/dev/null 2>&1

run_health_test() {
    local environment="$1"
    local domain="$2"
    local source_config="$3"
    local environment_directory="${temporary_directory}/${environment}"
    local port=""
    local status=""
    local body="${environment_directory}/response.json"
    local headers="${environment_directory}/response.headers"
    local logs="${environment_directory}/proxy.log"
    local attempt

    mkdir -p "${environment_directory}"
    current_network="jumin-health-${environment}-$$"
    current_backend="jumin-health-backend-${environment}-$$"
    current_proxy="jumin-health-proxy-${environment}-$$"

    sed \
        -e "s#/etc/letsencrypt/live/${domain}/fullchain.pem#/etc/nginx/health-test.crt#" \
        -e "s#/etc/letsencrypt/live/${domain}/privkey.pem#/etc/nginx/health-test.key#" \
        "${source_config}" > "${environment_directory}/default.conf"

    cat > "${environment_directory}/backend.conf" <<'EOF'
server {
    listen 8080;
    location = /actuator/health {
        default_type application/json;
        return 200 '{"status":"UP"}';
    }
}
EOF

    docker network create "${current_network}" >/dev/null
    docker run --detach \
        --name "${current_backend}" \
        --network "${current_network}" \
        --network-alias backend \
        --volume "${environment_directory}/backend.conf:/etc/nginx/conf.d/default.conf:ro" \
        "${image}" >/dev/null

    docker run --rm \
        --network "${current_network}" \
        --volume "${environment_directory}/default.conf:/etc/nginx/conf.d/default.conf:ro" \
        --volume "${temporary_directory}/health-test.crt:/etc/nginx/health-test.crt:ro" \
        --volume "${temporary_directory}/health-test.key:/etc/nginx/health-test.key:ro" \
        "${image}" nginx -t

    docker run --detach \
        --name "${current_proxy}" \
        --network "${current_network}" \
        --publish '127.0.0.1::443' \
        --volume "${environment_directory}/default.conf:/etc/nginx/conf.d/default.conf:ro" \
        --volume "${temporary_directory}/health-test.crt:/etc/nginx/health-test.crt:ro" \
        --volume "${temporary_directory}/health-test.key:/etc/nginx/health-test.key:ro" \
        "${image}" >/dev/null

    port="$(docker port "${current_proxy}" 443/tcp | sed 's/.*://')"
    for attempt in $(seq 1 20); do
        status="$(curl --noproxy '*' --insecure --silent --show-error \
            --resolve "${domain}:${port}:127.0.0.1" \
            --output "${body}" --dump-header "${headers}" --write-out '%{http_code}' \
            --max-time 5 "https://${domain}:${port}/health?test_marker=private-query" || true)"
        if [[ "${status}" == '200' ]]; then
            break
        fi
        sleep 0.25
    done

    if [[ "${status}" != '200' ]] || ! grep -Fq '"status":"UP"' "${body}"; then
        echo "${environment}: /health did not return JSON status UP (HTTP ${status})." >&2
        return 1
    fi
    if ! grep -Eiq '^Cache-Control:.*no-store' "${headers}"; then
        echo "${environment}: /health response is missing Cache-Control: no-store." >&2
        return 1
    fi

    docker stop "${current_backend}" >/dev/null
    status="$(curl --noproxy '*' --insecure --silent --show-error \
        --resolve "${domain}:${port}:127.0.0.1" \
        --output "${body}" --write-out '%{http_code}' \
        --max-time 8 "https://${domain}:${port}/health?test_marker=private-query" || true)"
    if [[ "${status}" != '502' && "${status}" != '504' ]]; then
        echo "${environment}: /health should fail when backend is unavailable (HTTP ${status})." >&2
        return 1
    fi

    docker logs "${current_proxy}" > "${logs}" 2>&1
    if ! grep -Fq '"event":"proxy_5xx"' "${logs}" \
        || ! grep -Fq '"environment":"'"${environment}"'"' "${logs}" \
        || ! grep -Fq '"status":'"${status}" "${logs}"; then
        echo "${environment}: expected structured proxy 5xx log was not emitted." >&2
        return 1
    fi
    if grep -Fq 'private-query' "${logs}"; then
        echo "${environment}: proxy log exposed the health request query string." >&2
        return 1
    fi

    echo "${environment}: /health returned JSON UP, then HTTP ${status} when the isolated mock backend stopped; proxy 5xx JSON omitted the query string."

    docker rm --force "${current_proxy}" "${current_backend}" >/dev/null
    docker network rm "${current_network}" >/dev/null
    current_proxy=""
    current_backend=""
    current_network=""
}

run_health_test dev dev.jucha.info "${repository_root}/infra/nginx/jumin.conf"
run_health_test prod jucha.info "${repository_root}/infra/nginx/jumin.prod.conf"
