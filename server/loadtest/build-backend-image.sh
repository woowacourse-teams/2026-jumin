#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
server_dir="$(cd -- "$script_dir/.." && pwd)"
repo_root="$(cd -- "$server_dir/.." && pwd)"

cd "$server_dir"
./gradlew bootJar

jar_file="$(find build/libs -maxdepth 1 -type f -name '*.jar' ! -name '*-plain.jar' -print -quit)"
if [[ -z "$jar_file" || ! -s "$jar_file" ]]; then
  echo '실행 가능한 backend JAR을 찾을 수 없습니다.' >&2
  exit 1
fi

mkdir -p "$script_dir/image-context" "$script_dir/results"
cp "$jar_file" "$script_dir/image-context/app.jar"

docker compose --file "$repo_root/infra/docker-compose.loadtest.yml" build backend
