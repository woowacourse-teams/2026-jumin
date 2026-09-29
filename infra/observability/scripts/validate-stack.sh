#!/usr/bin/env bash
set -Eeuo pipefail

stack_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary="$(mktemp -d)"
network="jumin-observability-check-${RANDOM}-$$"
cleanup() {
  docker rm -f "${network}-proxy" "${network}-upstream" >/dev/null 2>&1 || true
  docker network rm "${network}" >/dev/null 2>&1 || true
  rm -rf "${temporary}"
}
trap cleanup EXIT

docker compose -f "${stack_dir}/compose.yml" config --quiet
certificate_dir="${temporary}/certbot/conf/live/grafana.jucha.info"
mkdir -p "${certificate_dir}" "${temporary}/certbot/www"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -subj '/CN=grafana.jucha.info' \
  -keyout "${certificate_dir}/privkey.pem" \
  -out "${certificate_dir}/fullchain.pem" >/dev/null 2>&1
printf 'alloy:%s\n' "$(printf 'test-password\n' | openssl passwd -apr1 -stdin)" \
  > "${temporary}/htpasswd"
for config in bootstrap.conf grafana.conf; do
  test -f "${stack_dir}/nginx/${config}"
  docker run --rm \
    -v "${stack_dir}/nginx/${config}:/etc/nginx/conf.d/default.conf:ro" \
    -v "${temporary}/certbot/conf:/etc/letsencrypt:ro" \
    -v "${temporary}/certbot/www:/var/www/certbot:ro" \
    -v "${temporary}/htpasswd:/etc/nginx/htpasswd:ro" \
    nginx:1.30.4-alpine nginx -t
done

cat > "${temporary}/upstream.conf" <<'EOF'
server {
    listen 3000;
    listen 3100;
    listen 9090;
    location / { return 200 "$request_uri"; }
}
EOF
docker network create "${network}" >/dev/null
docker run --detach --name "${network}-upstream" --network "${network}" \
  --network-alias grafana --network-alias loki --network-alias prometheus \
  -v "${temporary}/upstream.conf:/etc/nginx/conf.d/default.conf:ro" \
  nginx:1.30.4-alpine >/dev/null
docker run --detach --name "${network}-proxy" --network "${network}" \
  -p 127.0.0.1::443 \
  -v "${stack_dir}/nginx/grafana.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "${temporary}/certbot/conf:/etc/letsencrypt:ro" \
  -v "${temporary}/certbot/www:/var/www/certbot:ro" \
  -v "${temporary}/htpasswd:/etc/nginx/htpasswd:ro" \
  nginx:1.30.4-alpine >/dev/null
port="$(docker port "${network}-proxy" 443/tcp)"
port="${port##*:}"
base_url="https://grafana.jucha.info:${port}"
curl_options=(--noproxy '*' --insecure --silent --show-error --max-time 5
  --resolve "grafana.jucha.info:${port}:127.0.0.1")
expect_status() {
  local expected="$1"; shift
  local actual
  actual="$(curl "${curl_options[@]}" --output /dev/null --write-out '%{http_code}' "$@")"
  [[ "${actual}" == "${expected}" ]] || {
    echo "Expected HTTP ${expected}, received ${actual}." >&2
    return 1
  }
}
expect_status 404 "${base_url}/loki/ready"
expect_status 404 "${base_url}/loki"
expect_status 404 "${base_url}/prometheus/-/ready"
expect_status 404 "${base_url}/prometheus"
expect_status 404 "${base_url}/loki/api/v1/push"
expect_status 401 --request POST "${base_url}/loki/api/v1/push"
expect_status 401 --request POST "${base_url}/prometheus/api/v1/write"
[[ "$(curl "${curl_options[@]}" --user 'alloy:test-password' --request POST \
  "${base_url}/loki/api/v1/push")" == '/loki/api/v1/push' ]]
[[ "$(curl "${curl_options[@]}" --user 'alloy:test-password' --request POST \
  "${base_url}/prometheus/api/v1/write")" == '/api/v1/write' ]]
[[ "$(curl "${curl_options[@]}" "${base_url}/login")" == '/login' ]]
docker run --rm -v "${stack_dir}/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
  --entrypoint /bin/promtool prom/prometheus:v3.15.0 check config /etc/prometheus/prometheus.yml
docker run --rm -v "${stack_dir}/loki/config.yml:/etc/loki/config.yml:ro" \
  grafana/loki:3.7.7 -config.file=/etc/loki/config.yml -verify-config=true
sed 's/__ENV__/dev/g' "${stack_dir}/alloy/config.alloy.template" > "${temporary}/config.alloy"
docker run --rm -v "${temporary}/config.alloy:/etc/alloy/config.alloy:ro" \
  grafana/alloy:v1.20.0 validate /etc/alloy/config.alloy
echo 'Observability configuration valid.'
