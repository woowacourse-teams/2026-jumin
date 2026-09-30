#!/usr/bin/env bash
set -Eeuo pipefail

stack_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temporary="$(mktemp -d)"
network="jumin-observability-check-${RANDOM}-$$"
cleanup() {
  local exit_status=$?
  if (( exit_status != 0 )); then
    for container in "${network}-grafana" "${network}-proxy" "${network}-upstream"; do
      if docker inspect "${container}" >/dev/null 2>&1; then
        echo "=== ${container} state ===" >&2
        docker inspect --format 'status={{.State.Status}} exit={{.State.ExitCode}} error={{.State.Error}}' \
          "${container}" >&2 || true
        echo "=== ${container} logs ===" >&2
        docker logs "${container}" >&2 || true
      fi
    done
  fi
  docker rm -f "${network}-grafana" "${network}-proxy" "${network}-upstream" >/dev/null 2>&1 || true
  docker network rm "${network}" >/dev/null 2>&1 || true
  rm -rf "${temporary}"
  exit "${exit_status}"
}
trap cleanup EXIT

docker compose -f "${stack_dir}/compose.yml" config --quiet

# Validate only alert-rule provisioning; do not load the live Discord contact point.
alert_rules_file="${stack_dir}/grafana/provisioning/alerting/rules.yml"
provisioning_dir="${temporary}/grafana-provisioning"
mkdir -p "${provisioning_dir}/alerting" "${provisioning_dir}/datasources"
cp "${alert_rules_file}" "${provisioning_dir}/alerting/rules.yml"
cp "${stack_dir}/grafana/provisioning/datasources/datasources.yml" \
  "${provisioning_dir}/datasources/datasources.yml"
docker run --detach --name "${network}-grafana" \
  -p 127.0.0.1::3000 \
  -e GF_SECURITY_ADMIN_USER=admin \
  -e GF_SECURITY_ADMIN_PASSWORD=test-password \
  -e GF_AUTH_ANONYMOUS_ENABLED=false \
  -e GF_USERS_ALLOW_SIGN_UP=false \
  -v "${provisioning_dir}:/etc/grafana/provisioning:ro" \
  grafana/grafana:13.2.2 >/dev/null
grafana_port="$(docker port "${network}-grafana" 3000/tcp)"
grafana_port="${grafana_port##*:}"
alert_rules_json="${temporary}/alert-rules.json"
expected_rule_count="$(awk '$1 == "-" && $2 == "uid:" { count++ } END { print count+0 }' "${alert_rules_file}")"
[[ "${expected_rule_count}" -gt 0 ]] || {
  echo 'No Grafana alert rules found.' >&2
  exit 1
}
rules_loaded=false
for attempt in {1..60}; do
  if curl --fail --silent --show-error --max-time 3 \
    --user admin:test-password \
    "http://127.0.0.1:${grafana_port}/api/v1/provisioning/alert-rules" \
    --output "${alert_rules_json}" 2>/dev/null \
    && [[ "$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1], encoding="utf-8"))))' "${alert_rules_json}")" == "${expected_rule_count}" ]]; then
    rules_loaded=true
    break
  fi
  sleep 1
done
[[ "${rules_loaded}" == true ]] || {
  echo 'Grafana did not load all provisioned alert rules.' >&2
  cat "${alert_rules_json}" >&2 || true
  docker logs "${network}-grafana" >&2 || true
  exit 1
}

certificate_dir="${temporary}/certbot/conf/live/grafana.jucha.info"
mkdir -p "${certificate_dir}" "${temporary}/certbot/www"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -subj '/CN=grafana.jucha.info' \
  -keyout "${certificate_dir}/privkey.pem" \
  -out "${certificate_dir}/fullchain.pem" >/dev/null 2>&1
printf 'alloy:%s\n' "$(printf 'test-password\n' | openssl passwd -apr1 -stdin)" \
  > "${temporary}/htpasswd"
for config in bootstrap.conf grafana.conf; do
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
wait_for_proxy() {
  local actual=''
  local curl_error="${temporary}/proxy-readiness-curl-error.log"
  for _ in {1..20}; do
    if actual="$(curl "${curl_options[@]}" --output /dev/null --write-out '%{http_code}' \
      "${base_url}/loki/api/v1/query" 2>"${curl_error}")"; then
      [[ "${actual}" == 404 ]] || {
        echo "Expected HTTP 404 from the Nginx readiness probe, received ${actual}." >&2
        return 1
      }
      return 0
    fi
    sleep 1
  done

  echo 'Nginx HTTPS proxy did not become ready after 20 attempts.' >&2
  if [[ -s "${curl_error}" ]]; then
    cat "${curl_error}" >&2
  fi
  return 1
}
expect_body() {
  local expected="$1"; shift
  local actual
  actual="$(curl "${curl_options[@]}" "$@")"
  [[ "${actual}" == "${expected}" ]] || {
    echo "Expected upstream response '${expected}', received '${actual}'." >&2
    return 1
  }
}
wait_for_proxy
expect_status 404 "${base_url}/loki/api/v1/query"
expect_status 404 "${base_url}/prometheus/api/v1/query"
expect_status 401 --request POST "${base_url}/loki/api/v1/push"
expect_status 401 --request POST "${base_url}/prometheus/api/v1/write"
expect_body '/loki/api/v1/push' --user 'alloy:test-password' --request POST \
  "${base_url}/loki/api/v1/push"
expect_body '/api/v1/write' --user 'alloy:test-password' --request POST \
  "${base_url}/prometheus/api/v1/write"
docker run --rm -v "${stack_dir}/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro" \
  --entrypoint /bin/promtool prom/prometheus:v3.15.0 check config /etc/prometheus/prometheus.yml
docker run --rm -v "${stack_dir}/loki/config.yml:/etc/loki/config.yml:ro" \
  grafana/loki:3.7.7 -config.file=/etc/loki/config.yml -verify-config=true
sed 's/__ENV__/dev/g' "${stack_dir}/alloy/config.alloy.template" > "${temporary}/config.alloy"
docker run --rm -v "${temporary}/config.alloy:/etc/alloy/config.alloy:ro" \
  grafana/alloy:v1.20.0 validate /etc/alloy/config.alloy
echo 'Observability configuration valid.'
