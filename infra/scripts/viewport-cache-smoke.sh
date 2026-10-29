#!/usr/bin/env bash
set +x
set -Eeuo pipefail

mode="${1:-}"
case "${mode}" in
  identity)
    [[ $# -eq 4 && "${2}" =~ ^jumin-backend-(dev|prod)$ &&
       "${3}" =~ ^sha256:[a-f0-9]{64}$ && "${4}" =~ ^[a-f0-9]{40}$ ]] || {
      echo 'Invalid backend identity check arguments.' >&2; exit 2;
    }
    actual_image="$(docker inspect --format '{{.Image}}' "${2}" 2>/dev/null)" || {
      echo 'Could not inspect the running backend image.' >&2; exit 1;
    }
    [[ "${actual_image}" == "${3}" ]] || {
      echo 'Running backend image does not match the newly built image.' >&2; exit 1;
    }
    # Inspect JSON in a pipe; only the presence of the exact commit is returned.
    if ! docker inspect --format '{{json .Config.Env}}' "${2}" 2>/dev/null |
      python3 -c 'import json,sys
try:
    values = json.load(sys.stdin)
    commits = [value.split("=", 1)[1] for value in values if value.startswith("APP_COMMIT_SHA=")]
    sys.exit(0 if commits == [sys.argv[1]] else 1)
except (ValueError, TypeError, AttributeError, IndexError):
    sys.exit(1)' "${4}"; then
      echo 'Running backend commit does not match the deployment commit.' >&2; exit 1
    fi
    ;;
  cache)
    [[ $# -eq 2 && "${2}" =~ ^[0-9]{1,5}$ ]] && ((10#${2} >= 1 && 10#${2} <= 65535)) || {
      echo 'Viewport smoke requires a valid loopback port.' >&2; exit 2;
    }
    python3 - "${2}" <<'PY'
import http.client
import json
import math
import re
import signal
import sys
import time

port = int(sys.argv[1])
deadline = time.monotonic() + 25.0
metrics_path = '/actuator/prometheus'
viewport_path = ('/api/parking/viewport?westLongitude=126.977&southLatitude=37.565'
                 '&eastLongitude=126.978&northLatitude=37.566'
                 '&freeOnly=false&excludeMechanical=false')

def timed_out(_signum, _frame):
    raise TimeoutError('overall viewport smoke deadline exceeded')

signal.signal(signal.SIGALRM, timed_out)
signal.setitimer(signal.ITIMER_REAL, 25.0)

def get(path, limit):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError('overall viewport smoke deadline exceeded')
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=min(3.0, remaining))
    try:
        connection.request('GET', path, headers={'Accept': 'application/json' if path != metrics_path else 'text/plain',
                                                  'Connection': 'close'})
        response = connection.getresponse()
        if response.status != 200:
            raise ValueError('loopback endpoint returned a non-200 response')
        length = response.getheader('Content-Length')
        if length is not None and (not length.isdigit() or int(length) > limit):
            raise ValueError('response length is invalid or exceeds the limit')
        body = response.read(limit + 1)
        if len(body) > limit or (length is not None and len(body) != int(length)):
            raise ValueError('response is incomplete or exceeds the limit')
        return body
    finally:
        connection.close()

def counter():
    text = get(metrics_path, 8 * 1024 * 1024).decode('utf-8')
    if not any(line.startswith(('# HELP ', '# TYPE ')) for line in text.splitlines()):
        raise ValueError('metrics endpoint did not return Prometheus data')
    total = 0.0
    for line in text.splitlines():
        if not line.startswith('parking_viewport_logical_total{') or '}' not in line:
            continue
        labels, rest = line.split('}', 1)
        if not re.search(r'(?:\{|,)\s*outcome="full_store_hit_true"\s*(?:,|$)', labels):
            continue
        fields = rest.split()
        if not fields:
            raise ValueError('full-hit counter has no value')
        value = float(fields[0])
        if not math.isfinite(value) or value < 0:
            raise ValueError('full-hit counter has an invalid value')
        total += value
    return total

def bad_constant(_value):
    raise ValueError('viewport response contains a non-JSON number')

try:
    before = counter()
    for _ in range(8):
        data = json.loads(get(viewport_path, 8 * 1024 * 1024), parse_constant=bad_constant)
        if not isinstance(data, dict) or type(data.get('totalCount')) is not int or not isinstance(data.get('parkingLots'), list):
            raise ValueError('viewport response has an invalid JSON shape')
        if data['totalCount'] < 0 or data['totalCount'] != len(data['parkingLots']):
            raise ValueError('viewport response count does not match the complete list')
        time.sleep(0.25)
    after = counter()
    if after <= before:
        print('Viewport cache smoke failed: full-store-hit counter did not increase.', file=sys.stderr)
        sys.exit(1)
except (OSError, TimeoutError, ValueError, http.client.HTTPException, UnicodeError, json.JSONDecodeError) as error:
    print(f'Viewport cache smoke failed: {type(error).__name__}.', file=sys.stderr)
    sys.exit(1)
finally:
    signal.setitimer(signal.ITIMER_REAL, 0)
print('Viewport cache smoke passed: full-store-hit counter increased.')
PY
    ;;
  *) echo 'Usage: viewport-cache-smoke.sh identity CONTAINER IMAGE_ID COMMIT | cache PORT' >&2; exit 2 ;;
esac
