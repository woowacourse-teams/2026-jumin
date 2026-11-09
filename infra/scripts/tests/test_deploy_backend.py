import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

REPOSITORY = Path(__file__).resolve().parents[3]
RELEASE_ID = f"{'a' * 40}-12-1"
OLD_RELEASE_ID = f"{'b' * 12}-11-1"

# Docker와 Nginx가 관찰한 실행 상태를 구분해 파일 교체와 실제 트래픽 전환을 검증한다.
COMMAND_FIXTURE = r'''
import json
import os
from pathlib import Path
import sys

root = Path(os.environ['TEST_ROOT'])
state_path = root / 'state.json'
state = json.loads(state_path.read_text())
tool, *args = sys.argv
with (root / 'calls').open('a') as calls:
    print(Path(tool).name, *args, file=calls)

if Path(tool).name == 'curl':
    # 호스트 포트에 응답자가 있어도 배포 검증은 지정한 Nginx에서 수행해야 한다.
    print('HTTP/1.1 200 OK\nX-Jumin-Backend: http://backend-blue:8080\n\n{"status":"UP"}')
    sys.exit(0)

command, *args = args
if command == 'inspect' and args[0] != '--format':
    if len(args) == 1:
        if args[0] not in state['running'] and not state.get('proxy_exists'):
            sys.exit(1)
        print('[{}]')
    else:
        inspected = []
        for container in args:
            environment = state['credentials'][container].copy()
            if container in state['cache_modes']:
                environment.append('JUMIN_VIEWPORT_CACHE_ENABLED=' + state['cache_modes'][container])
            inspected.append({'Config': {'Env': environment}, 'Mounts': state.get('mounts', {}).get(container, [])})
        print(json.dumps(inspected))
elif command == 'inspect':
    template, container = args[-2:]
    if template == '{{.Id}}':
        print(container)
    elif template == '{{.Id}} {{.State.StartedAt}}':
        print(container + ' generation-1')
    elif template == '{{.State.Running}}':
        print(str(container in state['running']).lower())
    elif template == '{{.Config.Image}}':
        print(state['images'][container])
    else:
        print(state['cache_modes'].get(container, ''))
elif command == 'compose':
    assert args[:2] == ['--project-name', 'jumin-backend-prod']
    assert os.environ['BACKEND_NETWORK_EXTERNAL'] == 'true'
    container = 'jumin-backend-prod' + args[-1].removeprefix('backend')
    state['running'].append(container)
    state['images'][container] = 'jumin-backend:' + os.environ['IMAGE_TAG']
    state['cache_modes'][container] = os.environ['JUMIN_VIEWPORT_CACHE_ENABLED']
    state['credentials'][container] = [key + '=' + value for key, value in state['new_credentials'].items()]
elif command == 'start':
    state['running'].append(args[0])
elif command == 'stop':
    state['running'].remove(args[0])
elif command == 'exec':
    container, executable, *options = args
    if executable in ('sh', 'wget') and options[-1].startswith('http://127.0.0.1:18080/'):
        if state.get('unmanaged_proxy'):
            sys.exit(7)
        path = options[-1].rsplit('/', 1)[1]
        if path == 'health' and state['route'] == state.get('hung_health'):
            sys.exit(1)
        healthy = state['route'] != state.get('unhealthy_route')
        status = '204 No Content' if path == 'route' else ('200 OK' if healthy else '503 Service Unavailable')
        headers = f"  HTTP/1.1 {status}\n  X-Jumin-Backend: http://{state['route']}:8080\n\n"
        body = '{"status":"UP"}' if path == 'health' and healthy else ''
        # Docker가 wget의 두 출력 스트림을 별도로 수신하면 본문이 헤더보다 먼저 도착할 수 있다.
        print(body + headers if executable == 'wget' else headers + body)
    elif executable in ('wget', 'curl'):
        if state.get('candidate_unready'):
            sys.exit(1)
        print('{"status":"UP"}')
    elif executable == 'ps':
        print(f"{state['worker']} 1 nginx: worker process")
        if state.get('keep_old_worker') and state['worker'] > 10:
            print("10 1 nginx: worker process is shutting down")
    elif executable == 'nginx' and options == ['-s', 'reload']:
        route_file = root / 'proxy/backend-routing/active.conf'
        route = route_file.read_text().split('://')[1].split(':')[0] if route_file.exists() else 'backend'
        if route == state.get('reload_error'):
            sys.exit(1)
        if route != state.get('ignore_reload_for'):
            state['route'] = route
            state['worker'] += 1

state_path.write_text(json.dumps(state))
'''


class BackendDeploymentTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.binaries = self.root / 'bin'
        self.binaries.mkdir()
        self.calls = self.root / 'calls'
        self.state_file = self.root / 'state.json'
        self.state = {
            'route': 'backend',
            'worker': 10,
            'running': ['jumin-nginx-prod', 'jumin-backend-prod'],
            'images': {'jumin-backend-prod': f'jumin-backend:{OLD_RELEASE_ID}'},
            'cache_modes': {'jumin-backend-prod': 'false'},
            'new_credentials': {'ADMIN_LOGIN_ID': 'admin', 'ADMIN_PASSWORD_HASH': 'hash',
                                'ADMIN_TOKEN_SECRET': 'key', 'ADMIN_ENV_LABEL': 'prod'},
            'credentials': {'jumin-backend-prod': ['ADMIN_LOGIN_ID=admin', 'ADMIN_PASSWORD_HASH=hash',
                                                 'ADMIN_TOKEN_SECRET=key', 'ADMIN_ENV_LABEL=prod']},
        }
        self.route_file = self.root / 'proxy/backend-routing/active.conf'
        self.release_root = self.root / 'backend'
        self.current = self.release_root / 'current'
        self.old_release = self.release_root / 'releases' / OLD_RELEASE_ID
        self.old_release.mkdir(parents=True)
        self.current.symlink_to(self.old_release)
        for name in ('flock', 'sleep'):
            self.write_binary(name, '#!/bin/sh\nexit 0\n')
        self.write_binary('nohup', '#!/bin/sh\nprintf "drain-monitor %s\\n" "$*" >> "$TEST_ROOT/calls"\n')
        for name in ('docker', 'curl'):
            self.write_binary(name, f'#!{sys.executable}\n{COMMAND_FIXTURE}')

        artifact = self.root / 'artifact'
        artifact.mkdir()
        (artifact / 'app.jar').write_bytes(b'unit-test-artifact')
        self.environment = dict(
            os.environ, PATH=str(self.binaries) + os.pathsep + os.environ['PATH'],
            GITHUB_WORKSPACE=str(REPOSITORY), GITHUB_SHA='a' * 40, GITHUB_RUN_ID='12',
            GITHUB_RUN_ATTEMPT='1', BACKEND_ARTIFACT_DIR=str(artifact),
            BACKEND_RELEASE_ROOT=str(self.release_root), TEST_ROOT=str(self.root),
            JUMIN_VIEWPORT_CACHE_ENABLED='false', PARKING_AVAILABILITY_ENABLED='false',
        )

    def write_binary(self, name, body):
        path = self.binaries / name
        path.write_text(body)
        path.chmod(0o755)

    def run_deployment(self, *args, command=None):
        self.state_file.write_text(json.dumps(self.state))
        if command is None:
            command = ['bash', str(REPOSITORY / 'infra/scripts/deploy-backend.sh'), 'prod', *args]
        result = subprocess.run(
            command, cwd=REPOSITORY, env=self.environment, capture_output=True, text=True, timeout=30,
        )
        self.state = json.loads(self.state_file.read_text())
        return result

    def test_switches_legacy_then_alternates_slots(self):
        result = self.run_deployment()

        # 구버전 중지 전에 프록시 내부에서 후보 readiness를 확인하고 라우팅을 바꾼다.
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.current.resolve().name, RELEASE_ID)
        self.assertEqual(self.state['route'], 'backend-blue')
        calls = self.calls.read_text()
        self.assertLess(calls.index('/health/readiness'), calls.index('nginx -s reload'))
        self.assertLess(calls.index('nginx -s reload'), calls.index('docker stop jumin-backend-prod\n'))
        self.assertNotIn('docker-compose.viewport.yml', calls)
        self.assertNotIn('drain-monitor', calls)
        self.assertFalse(list(self.release_root.rglob('redis-ca.pem')))

        self.environment['GITHUB_RUN_ATTEMPT'] = '2'
        result = self.run_deployment()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.state['route'], 'backend-green')
        self.assertEqual(self.state['running'], ['jumin-nginx-prod', 'jumin-backend-prod-green'])

    def test_failed_readiness_preserves_legacy_route_and_release(self):
        self.state['candidate_unready'] = True

        result = self.run_deployment()

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.current.resolve(), self.old_release)
        self.assertEqual(self.state['running'], ['jumin-nginx-prod', 'jumin-backend-prod'])
        self.assertFalse(self.route_file.exists())
        self.assertNotIn('nginx -s reload', self.calls.read_text())

    def test_failed_proxy_switch_restores_legacy_and_stops_candidate(self):
        # reload가 성공해도 대상의 health가 503이면 롤백한다.
        self.state['unhealthy_route'] = 'backend-blue'

        result = self.run_deployment()

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.current.resolve(), self.old_release)
        self.assertFalse(self.route_file.exists())
        self.assertEqual(self.state['route'], 'backend')
        self.assertEqual(self.state['running'], ['jumin-nginx-prod', 'jumin-backend-prod'])
        self.assertEqual(self.calls.read_text().count('nginx -s reload'), 2)

    def test_healthy_old_route_does_not_count_as_candidate_switch(self):
        self.state['ignore_reload_for'] = 'backend-blue'

        result = self.run_deployment()

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.current.resolve(), self.old_release)
        self.assertEqual(self.state['route'], 'backend')

    def test_failed_proxy_rollback_retains_both_containers(self):
        self.state.update(unhealthy_route='backend-blue', reload_error='backend')

        result = self.run_deployment()

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.current.resolve(), self.old_release)
        self.assertIn('jumin-backend-prod-blue', self.state['running'])
        self.assertIn('jumin-backend-prod', self.state['running'])

    def test_long_running_requests_keep_previous_backend_alive(self):
        self.state['keep_old_worker'] = True

        result = self.run_deployment()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.state['route'], 'backend-blue')
        self.assertIn('jumin-backend-prod', self.state['running'])
        self.assertIn('have not drained', result.stderr)
        # 부모 job 종료 뒤 별도로 실행되는 모니터의 시작까지 기다린다.
        for _ in range(100):
            if 'drain-monitor bash' in self.calls.read_text():
                break
            time.sleep(0.01)
        self.assertIn('drain-monitor bash', self.calls.read_text())
        self.assertIn('docker update --restart=no jumin-backend-prod', self.calls.read_text())

    def test_manual_rollback_starts_retained_container_when_active_is_unhealthy(self):
        self.assertEqual(self.run_deployment().returncode, 0)
        self.calls.unlink()
        self.state['hung_health'] = 'backend-blue'

        result = self.run_deployment('rollback', 'backend')

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.current.resolve(), self.old_release)
        self.assertEqual(self.state['route'], 'backend')
        self.assertIn('docker start jumin-backend-prod\n', self.calls.read_text())
        self.assertNotIn('docker compose', self.calls.read_text())

    def assert_cancelled_deployment_keeps_drain_cleanup(self, signal_name, expected_exit):
        # Runner처럼 workflow 진입 PID에 신호를 보내 배포 셸까지 전달되는지 확인한다.
        workflow = (REPOSITORY / '.github/workflows/server-prod-cd.yml').read_text()
        step = workflow.split('      - name: Deploy backend with Docker Compose\n', 1)[1].split('\n      - name:', 1)[0]
        run = next(line.removeprefix('        run: ') for line in step.splitlines() if line.startswith('        run: '))
        entrypoint = self.root / 'workflow-step.sh'
        entrypoint.write_text(f'export TEST_STEP_PID=$$\n{run}\n')
        self.state['keep_old_worker'] = True
        self.environment['TEST_CANCEL_SIGNAL'] = signal_name
        self.write_binary('sleep', f'''#!{sys.executable}
import json, os, signal
from pathlib import Path
root = Path(os.environ["TEST_ROOT"])
state = json.loads((root / "state.json").read_text())
if state["route"] == "backend-blue" and not (root / "cancel-sent").exists():
    (root / "cancel-sent").touch()
    os.kill(int(os.environ["TEST_STEP_PID"]), getattr(signal, "SIG" + os.environ["TEST_CANCEL_SIGNAL"]))
''')
        # 실제 백그라운드 모니터에 넘긴 인수를 기록해 부모 종료 후 재실행한다.
        self.write_binary('nohup', f'''#!{sys.executable}
import json, os, sys
from pathlib import Path
root = Path(os.environ["TEST_ROOT"])
temporary = root / "drain-args.tmp"
temporary.write_text(json.dumps(sys.argv[1:]))
temporary.replace(root / "drain-args.json")
''')

        result = self.run_deployment(command=['bash', '--noprofile', '--norc', '-e', '-o', 'pipefail', str(entrypoint)])

        self.assertEqual(result.returncode, expected_exit, result.stderr)
        self.assertEqual(self.state['route'], 'backend-blue')
        self.assertEqual(self.current.resolve().name, RELEASE_ID)
        self.assertIn('jumin-backend-prod', self.state['running'])
        self.assertIn('jumin-backend-prod-blue', self.state['running'])
        self.assertIn('docker update --restart=no jumin-backend-prod\n', self.calls.read_text())
        self.assertNotIn('docker stop jumin-backend-prod\n', self.calls.read_text())
        arguments_file = self.root / 'drain-args.json'
        for _ in range(100):
            if arguments_file.exists():
                break
            time.sleep(0.01)
        self.assertTrue(arguments_file.exists(), '취소 후 정리 모니터가 예약되어야 합니다.')

        # 부모가 끝난 뒤 이전 요청이 완료되면 모니터가 이전 슬롯만 정리한다.
        self.state['keep_old_worker'] = False
        self.state_file.write_text(json.dumps(self.state))
        monitor = subprocess.run(
            json.loads(arguments_file.read_text()), env=self.environment,
            capture_output=True, text=True, timeout=5,
        )
        self.assertEqual(monitor.returncode, 0, monitor.stderr)
        state = json.loads(self.state_file.read_text())
        self.assertEqual(state['running'], ['jumin-nginx-prod', 'jumin-backend-prod-blue'])

    def test_sigterm_after_commit_preserves_cleanup_and_current_route(self):
        self.assert_cancelled_deployment_keeps_drain_cleanup('TERM', 143)

    def test_sigint_after_commit_preserves_cleanup_and_current_route(self):
        self.assert_cancelled_deployment_keeps_drain_cleanup('INT', 130)

    def test_manual_rollback_reuses_target_with_inflight_requests(self):
        # 이전 요청이 살아 있어도 이미 실행 중인 이전 슬롯을 바로 사용할 수 있다.
        self.state['keep_old_worker'] = True
        self.assertEqual(self.run_deployment().returncode, 0)
        self.calls.unlink()

        result = self.run_deployment('rollback', 'backend')

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.state['route'], 'backend')
        self.assertNotIn('docker stop jumin-backend-prod\n', self.calls.read_text())
        self.assertNotIn('docker start jumin-backend-prod\n', self.calls.read_text())

    def test_failed_manual_rollback_reschedules_cleanup_for_restored_route(self):
        # 라우팅이 잠깐 바뀌면 기존 모니터는 취소되므로 복구된 전환의 모니터가 필요하다.
        self.state['keep_old_worker'] = True
        self.assertEqual(self.run_deployment().returncode, 0)
        self.calls.unlink()
        self.state['unhealthy_route'] = 'backend'

        result = self.run_deployment('rollback', 'backend')

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.state['route'], 'backend-blue')
        self.assertIn('Cleanup is monitoring', result.stderr)
        self.assertIn('docker update --restart=no jumin-backend-prod\n', self.calls.read_text())
        self.assertNotIn('docker update --restart=no jumin-backend-prod-blue\n', self.calls.read_text())

    def test_manual_rollback_rejects_an_unpromoted_slot(self):
        self.assertEqual(self.run_deployment().returncode, 0)
        self.state['ignore_reload_for'] = 'backend-green'
        self.environment['GITHUB_RUN_ATTEMPT'] = '2'
        self.assertNotEqual(self.run_deployment().returncode, 0)
        self.calls.unlink()
        self.state.pop('ignore_reload_for')

        result = self.run_deployment('rollback', 'backend-green')

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('not promoted', result.stderr)
        self.assertNotIn('docker start', self.calls.read_text())
        self.assertEqual(self.state['route'], 'backend-blue')

    def test_cache_rollout_requires_a_compatible_legacy_writer(self):
        # 이전 앱의 CSV 쓰기는 셀 매핑을 갱신할 수 없다.
        self.state['cache_modes'] = {}
        self.environment['JUMIN_VIEWPORT_CACHE_ENABLED'] = 'true'

        result = self.run_deployment()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('without viewport mapping support', result.stderr)
        self.assertNotIn('docker compose', self.calls.read_text())

    def test_cache_enabled_rollback_cannot_overlap_an_incompatible_legacy_writer(self):
        self.state['cache_modes'] = {'jumin-backend-prod-blue': 'true'}
        self.state['images']['jumin-backend-prod-blue'] = f'jumin-backend:{RELEASE_ID}'
        self.state['credentials']['jumin-backend-prod-blue'] = self.state['credentials']['jumin-backend-prod']
        promoted_release = self.release_root / 'releases' / RELEASE_ID
        promoted_release.mkdir()
        (promoted_release / '.promoted').touch()

        result = self.run_deployment('rollback', 'backend-blue')

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('without viewport mapping support', result.stderr)
        self.assertNotIn('docker start', self.calls.read_text())

    def test_legacy_rollback_cannot_overlap_an_inactive_cache_enabled_slot(self):
        self.state['keep_old_worker'] = True
        self.assertEqual(self.run_deployment().returncode, 0)
        self.state['cache_modes'] = {'jumin-backend-prod-green': 'true'}
        self.state['running'].append('jumin-backend-prod-green')
        self.calls.unlink()

        result = self.run_deployment('rollback', 'backend')

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('without viewport mapping support', result.stderr)
        self.assertNotIn('nginx -s reload', self.calls.read_text())

    def test_unmanaged_proxy_is_detected_before_backend_is_changed(self):
        self.state['unmanaged_proxy'] = True

        result = self.run_deployment()

        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('docker compose', self.calls.read_text())
        self.assertNotIn('docker stop', self.calls.read_text())
        self.assertNotIn('\ncurl ', self.calls.read_text())

    def test_fresh_install_stages_blue_before_proxy_exists(self):
        self.state['running'] = []

        result = self.run_deployment()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.route_file.read_text(), '~^ http://backend-blue:8080;\n')
        self.assertEqual(self.state['running'], ['jumin-backend-prod-blue'])

    def test_rollback_rejects_rotated_admin_credentials_without_disclosing_them(self):
        # 교체된 서명 키와 비밀번호는 이전 이미지로 돌아가도 폐기 상태를 유지한다.
        self.state['new_credentials']['ADMIN_TOKEN_SECRET'] = 'rotated-token-secret-must-stay-private'
        self.assertEqual(self.run_deployment().returncode, 0)
        self.calls.unlink()

        result = self.run_deployment('rollback', 'backend')

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('credentials differ', result.stderr)
        self.assertNotIn('rotated-token-secret-must-stay-private', result.stdout + result.stderr)
        self.assertNotIn('docker start', self.calls.read_text())
        self.assertEqual(self.state['route'], 'backend-blue')

    def test_rollback_rejects_rotated_admin_password(self):
        self.state['new_credentials']['ADMIN_PASSWORD_HASH'] = 'new-password-hash'
        self.assertEqual(self.run_deployment().returncode, 0)

        result = self.run_deployment('rollback', 'backend')

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.state['route'], 'backend-blue')

    def test_rollback_rejects_rotated_search_key_without_disclosing_it(self):
        # 관리자 인증이 같아도 교체한 목적지 검색 키를 이전 키로 되돌리면 안 된다.
        secret = 'replacement-search-key-must-not-be-logged'
        self.state['credentials']['jumin-backend-prod'].append('LOCAL_SEARCH_REST_API_KEY=retired')
        self.state['new_credentials']['LOCAL_SEARCH_REST_API_KEY'] = secret
        self.assertEqual(self.run_deployment().returncode, 0)
        self.calls.unlink()

        result = self.run_deployment('rollback', 'backend')

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('runtime settings differ', result.stderr)
        self.assertNotIn(secret, result.stdout + result.stderr)
        self.assertNotIn('docker start', self.calls.read_text())
        self.assertEqual(self.state['route'], 'backend-blue')
        self.assertEqual(self.current.resolve().name, RELEASE_ID)

    def test_rollback_requires_matching_redis_connection_settings_and_ca(self):
        # 캐시를 쓰는 성공 릴리스 두 개의 실제 bind mount와 Redis 접속 설정을 재현한다.
        self.assertEqual(self.run_deployment().returncode, 0)
        legacy = 'jumin-backend-prod'
        active = 'jumin-backend-prod-blue'
        legacy_ca = self.old_release / 'redis-ca.pem'
        active_ca = self.current.resolve() / 'redis-ca.pem'
        redis_environment = [
            'JUMIN_VIEWPORT_CACHE_REDISURI=rediss://redis.example:6379',
            'JUMIN_VIEWPORT_CACHE_REDISUSERNAME=viewport',
            'JUMIN_VIEWPORT_CACHE_REDISPASSWORD=test-redis-password',
            'JUMIN_VIEWPORT_CACHE_REDISTLSCAFILE=/app/redis-ca.pem',
        ]
        self.state['mounts'] = {}
        for container, ca in ((legacy, legacy_ca), (active, active_ca)):
            self.state['cache_modes'][container] = 'true'
            self.state['credentials'][container].extend(redis_environment)
            self.state['mounts'][container] = [{'Type': 'bind', 'Source': str(ca),
                                                'Destination': '/app/redis-ca.pem', 'RW': False}]
            ca.write_text('current-test-ca\n')

        # 인증정보나 CA가 바뀌었거나 CA 파일을 확인할 수 없으면 전환 전에 멈춘다.
        current_env = self.state['credentials'][active]
        self.state['credentials'][active] = [
            value.replace('=test-redis-password', '=rotated-test-redis-password') for value in current_env
        ]
        result = self.run_deployment('rollback', 'backend')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('runtime settings differ', result.stderr)
        self.state['credentials'][active] = current_env

        for ca_contents, error in (('retired-test-ca\n', 'Redis CA differs'), (None, 'could not verify the Redis CA')):
            with self.subTest(ca_contents=ca_contents):
                if ca_contents is None:
                    legacy_ca.unlink()
                else:
                    legacy_ca.write_text(ca_contents)
                self.calls.unlink()

                result = self.run_deployment('rollback', 'backend')

                self.assertNotEqual(result.returncode, 0)
                self.assertIn(error, result.stderr)
                self.assertNotIn('docker start', self.calls.read_text())
                self.assertEqual(self.state['route'], 'backend-blue')

        # 호스트 파일 경로가 다르더라도 같은 CA를 쓰면 이전 슬롯을 재기동할 수 있다.
        legacy_ca.write_text(active_ca.read_text())
        result = self.run_deployment('rollback', 'backend')

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.state['route'], 'backend')

    def test_fresh_install_can_replace_a_staged_slot_before_proxy_bootstrap(self):
        self.state['running'] = []
        self.assertEqual(self.run_deployment().returncode, 0)
        self.environment['GITHUB_RUN_ATTEMPT'] = '2'

        result = self.run_deployment()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.route_file.read_text(), '~^ http://backend-green:8080;\n')
        self.assertEqual(self.state['running'], ['jumin-backend-prod-green'])

    def test_fresh_install_can_recover_a_stopped_staged_slot(self):
        self.state['running'] = []
        self.assertEqual(self.run_deployment().returncode, 0)
        self.state['running'] = []
        self.environment['GITHUB_RUN_ATTEMPT'] = '2'

        result = self.run_deployment()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.state['running'], ['jumin-backend-prod-green'])

    def test_missing_initialized_proxy_still_blocks_deployment(self):
        self.assertEqual(self.run_deployment().returncode, 0)
        self.state['running'].remove('jumin-nginx-prod')
        self.environment['GITHUB_RUN_ATTEMPT'] = '2'

        result = self.run_deployment()

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.state['running'], ['jumin-backend-prod-blue'])

    def test_invalid_activation_flag_fails_before_replacing_backend(self):
        self.environment['JUMIN_VIEWPORT_CACHE_ENABLED'] = 'invalid'

        result = self.run_deployment()

        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('docker compose', self.calls.read_text())

    def test_failed_redis_preflight_does_not_replace_backend_or_log_password(self):
        password = 'test-password-must-not-be-logged'
        self.environment.update(
            JUMIN_VIEWPORT_CACHE_ENABLED='true', JUMIN_VIEWPORT_CACHE_REDISUSERNAME='viewport',
            JUMIN_VIEWPORT_CACHE_REDISPASSWORD=password, VIEWPORT_REDIS_TLS_CA_PEM='test-public-certificate',
            JUMIN_VIEWPORT_CACHE_REDISURI='rediss://10.0.100.241:6379',
        )
        self.write_binary('python3', '#!/bin/sh\nexit 1\n')

        result = self.run_deployment()

        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('docker compose', self.calls.read_text())
        self.assertNotIn(password, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
