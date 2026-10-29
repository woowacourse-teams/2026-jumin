#!/usr/bin/env python3
"""Exercise the deployment gate against real loopback HTTP and a fake Docker CLI."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / 'infra/scripts/viewport-cache-smoke.sh'
IMAGE = 'sha256:' + 'a' * 64
COMMIT = 'b' * 40


class FixtureServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, mode):
        self.mode = mode
        self.requests_seen = 0
        self.metric_reads = 0
        super().__init__(('127.0.0.1', 0), FixtureHandler)


class FixtureHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def respond(self, status, body, content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path == '/actuator/prometheus':
            self.server.metric_reads += 1
            hits = max(0, self.server.requests_seen - 1) if self.server.mode == 'hit' else 0
            body = ('# TYPE parking_viewport_logical_total counter\n'
                    'parking_viewport_logical_total{outcome="eligible"} 2.0\n'
                    f'parking_viewport_logical_total{{service="backend",outcome="full_store_hit_true"}} {hits}.0\n').encode()
            self.respond(200, body, 'text/plain')
            return
        if parsed.path != '/api/parking/viewport':
            self.respond(404, b'{}')
            return
        expected = {'westLongitude': ['126.977'], 'southLatitude': ['37.565'],
                    'eastLongitude': ['126.978'], 'northLatitude': ['37.566'],
                    'freeOnly': ['false'], 'excludeMechanical': ['false']}
        if parse_qs(parsed.query) != expected:
            self.respond(400, b'{}')
            return
        self.server.requests_seen += 1
        if self.server.mode == 'timeout':
            time.sleep(3.5)
        if self.server.mode == 'bad_json':
            self.respond(200, b'{"totalCount":1,"parkingLots":[]')
            return
        self.respond(200, b'{"totalCount":0,"parkingLots":[]}')


class SmokeTests(unittest.TestCase):
    def run_fixture(self, mode):
        server = FixtureServer(mode)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            started = time.monotonic()
            result = subprocess.run(['bash', str(SCRIPT), 'cache', str(server.server_port)],
                                    text=True, capture_output=True, timeout=12)
            return result, server.requests_seen, server.metric_reads, time.monotonic() - started
        finally:
            server.shutdown()
            server.server_close()
            worker.join(timeout=1)

    def test_http_200_without_full_hit_is_failure(self):
        result, requests, reads, _elapsed = self.run_fixture('fallback')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(requests, 8)
        self.assertEqual(reads, 2)
        self.assertNotIn('passed', result.stdout.lower())

    def test_full_hit_counter_increase_passes(self):
        result, requests, reads, _elapsed = self.run_fixture('hit')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(requests, 8)
        self.assertEqual(reads, 2)

    def test_request_timeout_fails_within_bound(self):
        result, requests, _reads, elapsed = self.run_fixture('timeout')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(requests, 1)
        self.assertLess(elapsed, 6)

    def test_malformed_json_fails(self):
        result, _requests, _reads, _elapsed = self.run_fixture('bad_json')
        self.assertNotEqual(result.returncode, 0)

    def test_arbitrary_url_is_rejected(self):
        result = subprocess.run(['bash', str(SCRIPT), 'cache', 'https://example.org'],
                                text=True, capture_output=True, timeout=3)
        self.assertNotEqual(result.returncode, 0)

    def run_identity(self, image=IMAGE, commit=COMMIT, actual_image=IMAGE, env_values=None):
        if env_values is None:
            env_values = ['DB_PASSWORD=must-not-appear-in-logs', 'APP_COMMIT_SHA=' + COMMIT]
        with tempfile.TemporaryDirectory() as directory:
            docker = Path(directory) / 'docker'
            docker.write_text('#!/usr/bin/env python3\n'
                'import os,sys\n'
                'fmt=sys.argv[sys.argv.index("--format")+1]\n'
                'print(os.environ["FIXTURE_IMAGE"] if fmt == "{{.Image}}" else os.environ["FIXTURE_ENV"])\n')
            docker.chmod(0o755)
            environment = dict(os.environ, PATH=directory + os.pathsep + os.environ['PATH'],
                               FIXTURE_IMAGE=actual_image, FIXTURE_ENV=json.dumps(env_values))
            result = subprocess.run(['bash', str(SCRIPT), 'identity', 'jumin-backend-dev', image, commit],
                                    env=environment, text=True, capture_output=True, timeout=5)
            self.assertNotIn('must-not-appear-in-logs', result.stdout + result.stderr)
            return result

    def test_image_and_commit_match(self):
        self.assertEqual(self.run_identity().returncode, 0)

    def test_wrong_running_image_fails(self):
        self.assertNotEqual(self.run_identity(actual_image='sha256:' + 'c' * 64).returncode, 0)

    def test_wrong_or_duplicate_commit_fails(self):
        self.assertNotEqual(self.run_identity(env_values=['APP_COMMIT_SHA=' + 'c' * 40]).returncode, 0)
        self.assertNotEqual(self.run_identity(env_values=['APP_COMMIT_SHA=' + COMMIT,
                                                          'APP_COMMIT_SHA=' + COMMIT]).returncode, 0)


if __name__ == '__main__':
    unittest.main()
