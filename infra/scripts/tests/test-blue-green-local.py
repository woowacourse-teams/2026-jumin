#!/usr/bin/env python3
"""Docker Nginx와 테스트 HTTP 앱으로 로컬 무중단 전환·롤백을 검증한다."""

from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
from urllib.error import URLError
from urllib.request import urlopen
import uuid

REPOSITORY = Path(__file__).resolve().parents[3]
NGINX_IMAGE = 'nginx:1.30.4-alpine'
BACKEND_IMAGE = 'python:3.13-alpine'

# 실제 배포 스크립트를 통과할 준비 상태와 지연 응답을 제공한다.
# DB, 외부 API, Spring 애플리케이션 동작은 이 테스트의 검증 범위 밖이다.
BACKEND_SOURCE = '''
import json
import signal
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
started = time.monotonic()

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        status, body = 200, VERSION
        if self.path == '/api/slow':
            print('slow request entered', flush=True)
            time.sleep(15)
        if self.path.startswith('/actuator/health'):
            if self.path.endswith('/readiness'):
                status = 503 if time.monotonic() - started < 2 else 200
            elif BROKEN_HEALTH:
                status = 503
            body = json.dumps({'status': 'UP' if status == 200 else 'DOWN'})
        self.send_response(status)
        self.end_headers()
        self.wfile.write(body.encode())

ThreadingHTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
'''


def main():
    subprocess.run(['docker', 'info'], check=True, capture_output=True)
    namespace = 'jumin-local-' + uuid.uuid4().hex[:10]
    image_name = namespace + '-backend'
    containers = [namespace + suffix for suffix in (
        '-nginx-prod', '-backend-prod', '-backend-prod-blue', '-backend-prod-green',
    )]
    network = namespace + '-prod_default'
    image_tags = [f'{image_name}:legacy']
    deploy_process = None

    with tempfile.TemporaryDirectory(prefix='jumin-blue-green-') as directory:
        root = Path(directory)
        for relative in ('infra/scripts', 'server', 'artifact', 'bin', 'proxy/backend-routing'):
            (root / relative).mkdir(parents=True)
        environment = dict(
            os.environ, GITHUB_WORKSPACE=str(root), GITHUB_SHA='e' * 40,
            GITHUB_RUN_ID='1', GITHUB_RUN_ATTEMPT='1', BACKEND_RELEASE_ROOT=str(root / 'backend'),
            BACKEND_ARTIFACT_DIR=str(root / 'artifact'), BACKEND_PORT='0',
            DB_URL='jdbc:postgresql://unused:5432/test', DB_USERNAME='local-test', DB_PASSWORD='local-test',
            LOCAL_SEARCH_REST_API_KEY='local-test', REVERSE_GEOCODING_CLIENT_ID='local-test',
            REVERSE_GEOCODING_CLIENT_SECRET='local-test', ADMIN_LOGIN_ID='local-test',
            ADMIN_PASSWORD_HASH='local-test', ADMIN_TOKEN_SECRET='local-test', ADMIN_ENV_LABEL='local-test',
            PARKING_AVAILABILITY_ENABLED='false', SEOUL_PARKING_API_KEY='', BUSAN_PARKING_API_KEY='',
            JUMIN_VIEWPORT_CACHE_ENABLED='false', BACKEND_NETWORK_EXTERNAL='false',
        )
        # Mac에도 flock을 제공한다. 같은 파일 디스크립터의 실제 OS 잠금을 사용한다.
        flock = root / 'bin/flock'
        flock.write_text(f'#!{sys.executable}\nimport fcntl\nfcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)\n')
        flock.chmod(0o755)
        environment['PATH'] = str(root / 'bin') + os.pathsep + environment['PATH']
        for name in ('deploy-backend.sh', 'drain-backend.sh'):
            source = (REPOSITORY / 'infra/scripts' / name).read_text()
            (root / 'infra/scripts' / name).write_text(source.replace('jumin-', namespace + '-'))
        # Docker Desktop에는 journald가 없으므로 테스트 사본에서 로컬 로그 드라이버를 쓴다.
        compose = root / 'infra/docker-compose.prod.yml'
        source = (REPOSITORY / 'infra/docker-compose.prod.yml').read_text()
        logging = '      driver: journald\n      options:\n        tag: jumin-prod/{{.Name}}'
        if logging not in source:
            raise RuntimeError('운영 Compose 로그 설정이 변경돼 로컬 테스트 어댑터 확인이 필요합니다.')
        compose.write_text(source.replace(logging, '      driver: local').replace('jumin-', namespace + '-'))
        (root / 'server/Dockerfile').write_text(
            f'FROM {BACKEND_IMAGE}\nRUN apk add --no-cache curl\n'
            'COPY app.jar /app.py\nENTRYPOINT ["python", "-u", "/app.py"]\n'
        )
        deployment = ['bash', str(root / 'infra/scripts/deploy-backend.sh'), 'prod']
        log_file = root / 'deploy.log'

        def run(*arguments, **options):
            return subprocess.run(arguments, env=environment, check=True, text=True, **options).stdout

        def request(url):
            with urlopen(url, timeout=25) as response:
                return response.read().decode()

        def wait_until(condition, message, timeout=30):
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                try:
                    if condition():
                        return
                except (URLError, OSError):
                    pass
                time.sleep(0.1)
            raise AssertionError(message)

        def prepare(version, attempt, broken=False):
            environment['GITHUB_RUN_ATTEMPT'] = str(attempt)
            (root / 'artifact/app.jar').write_text(
                f'VERSION={version!r}\nBROKEN_HEALTH={broken!r}\n' + BACKEND_SOURCE
            )
            image_tags.append(f"{image_name}:{environment['GITHUB_SHA']}-1-{attempt}")

        def deploy(logs):
            result = subprocess.run(deployment, env=environment, stdout=logs, stderr=subprocess.STDOUT, timeout=180)
            if result.returncode:
                raise AssertionError('배포 실패. 아래 Docker·배포 로그를 확인하세요.')

        try:
            prepare('legacy', 1)
            run('docker', 'build', '--quiet', '-f', str(root / 'server/Dockerfile'),
                '-t', image_tags[0], str(root / 'artifact'))
            environment['IMAGE_TAG'] = 'legacy'
            run('docker', 'compose', '--project-name', namespace + '-prod',
                '-f', str(compose), 'up', '-d', 'backend')
            run('docker', 'run', '-d', '--name', containers[0], '--network', network,
                '-p', '127.0.0.1::80', '-p', '127.0.0.1::18080',
                '-v', f'{root / "proxy/backend-routing"}:/etc/nginx/backend-routing:ro',
                '-v', f'{REPOSITORY / "infra/nginx/bootstrap.prod.conf"}:/etc/nginx/conf.d/default.conf:ro', NGINX_IMAGE)
            address = run('docker', 'port', containers[0], '80/tcp', capture_output=True).strip()
            api = f'http://{address}/api/'
            wait_until(lambda: request(api + 'version') == 'legacy', '테스트 백엔드 기동 실패')
            print(f'로컬 테스트 API  http://{address}/api/version', flush=True)
            responses, errors = [], []
            finished = threading.Event()

            def traffic():
                while not finished.is_set():
                    try:
                        responses.append(request(api + 'version'))
                    except Exception as error:
                        errors.append(str(error))
                    finished.wait(0.05)

            thread = threading.Thread(target=traffic, daemon=True)
            thread.start()
            try:
                with ThreadPoolExecutor(max_workers=1) as executor, log_file.open('a') as logs:
                    slow = executor.submit(request, api + 'slow')
                    wait_until(lambda: 'slow request entered' in run(
                        'docker', 'logs', containers[1], capture_output=True), '긴 요청이 기존 슬롯에 도달하지 않았습니다.')
                    prepare('blue', 1)
                    deploy_process = subprocess.Popen(deployment, env=environment, stdout=logs, stderr=subprocess.STDOUT)
                    wait_until(lambda: request(api + 'version') == 'blue', '블루 슬롯으로 전환되지 않았습니다.')
                    assert not slow.done(), '전환 전에 긴 요청이 끝나 검증할 수 없습니다.'
                    assert deploy_process.wait(timeout=180) == 0
                    deploy_process = None
                    assert slow.result(timeout=25) == 'legacy'
                    print('PASS  기존 긴 요청 완료 및 legacy → blue 전환', flush=True)
                    prepare('green', 2)
                    deploy(logs)
                    assert request(api + 'version') == 'green'
                    wait_until(lambda: 'green' in responses, '연속 요청이 그린 슬롯에 도달하지 않았습니다.')
                    print('PASS  blue → green 전환', flush=True)
                    subprocess.run([*deployment, 'rollback', 'backend-blue'], env=environment,
                                   stdout=logs, stderr=subprocess.STDOUT, check=True, timeout=180)
                    assert request(api + 'version') == 'blue'
                    print('PASS  보관한 blue 슬롯으로 수동 롤백', flush=True)
            finally:
                finished.set()
                thread.join(timeout=30)
            assert not errors, errors[:5]
            assert {'legacy', 'blue', 'green'} <= set(responses), set(responses)
            print(f'PASS  연속 API 요청 {len(responses)}건, 오류 0건', flush=True)
            prepare('broken', 3, broken=True)
            with log_file.open('a') as logs:
                result = subprocess.run(deployment, env=environment, stdout=logs, stderr=subprocess.STDOUT, timeout=180)
            assert result.returncode != 0, '잘못된 health 상태의 배포가 성공 처리됐습니다.'
            assert request(api + 'version') == 'blue'
            print('PASS  새 슬롯 health 실패 후 blue로 자동 복구', flush=True)
        except BaseException:
            if deploy_process is not None and deploy_process.poll() is None:
                deploy_process.terminate()
                try:
                    deploy_process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    deploy_process.kill()
                    deploy_process.wait()
            if log_file.exists():
                print(log_file.read_text(), file=sys.stderr)
            for container in containers:
                result = subprocess.run(['docker', 'logs', '--tail', '15', container], capture_output=True, text=True)
                print(result.stdout + result.stderr, file=sys.stderr)
            raise
        finally:
            subprocess.run(['docker', 'rm', '-f', *containers], capture_output=True)
            subprocess.run(['docker', 'network', 'rm', network], capture_output=True)
            subprocess.run(['docker', 'image', 'rm', *dict.fromkeys(image_tags)], capture_output=True)


if __name__ == '__main__':
    main()
