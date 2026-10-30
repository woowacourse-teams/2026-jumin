#!/usr/bin/env bash
set -Eeuo pipefail
repository_root="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$repository_root"
bash -n infra/scripts/deploy-backend.sh
bash -n infra/redis/deploy.sh
python3 -m unittest discover -s infra/scripts/tests -p 'test_deploy_*.py'
