import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

REPOSITORY = Path(__file__).resolve().parents[3]
RELEASE_ID = f"{'a' * 40}-12-1"
OLD_RELEASE_ID = f"{'b' * 12}-11-1"

# 단일 컨테이너의 이미지와 health만 대체하고 실제 개발 배포 셸의 교체·복구를 실행한다.
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
    if state['image'] in state.get('unhealthy_images', []):
        sys.exit(22)
    print('{"status":"UP"}')
    sys.exit(0)

command, *args = args
if command == 'inspect':
    if not state['image']:
        sys.exit(1)
    print(state['image'])
elif command == 'compose':
    assert args[:2] == ['--project-name', 'jumin-dev']
    assert args[-1] == 'backend'
    state['image'] = 'jumin-backend:' + os.environ['IMAGE_TAG']
    state_path.write_text(json.dumps(state))
    if state['image'] in state.get('failed_images', []):
        sys.exit(1)
elif command != 'build':
    raise AssertionError('개발 배포에서 예상하지 않은 Docker 명령: ' + command)
'''


class DevBackendDeploymentTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        binary = self.root / 'bin'
        binary.mkdir()
        for name in ('docker', 'curl'):
            self.write_binary(name, f'#!{sys.executable}\n{COMMAND_FIXTURE}')
        for name in ('flock', 'sleep'):
            self.write_binary(name, '#!/bin/sh\nexit 0\n')
        artifact = self.root / 'artifact'
        artifact.mkdir()
        (artifact / 'app.jar').write_bytes(b'test-artifact')
        self.release_root = self.root / 'backend'
        self.old_release = self.release_root / 'releases' / OLD_RELEASE_ID
        self.old_release.mkdir(parents=True)
        self.current = self.release_root / 'current'
        self.current.symlink_to(self.old_release)
        self.calls = self.root / 'calls'
        self.state_file = self.root / 'state.json'
        self.state = {'image': f'jumin-backend:{OLD_RELEASE_ID}'}
        self.environment = dict(
            os.environ, PATH=str(binary) + os.pathsep + os.environ['PATH'],
            GITHUB_WORKSPACE=str(REPOSITORY), GITHUB_SHA='a' * 40, GITHUB_RUN_ID='12',
            GITHUB_RUN_ATTEMPT='1', BACKEND_ARTIFACT_DIR=str(artifact),
            BACKEND_RELEASE_ROOT=str(self.release_root), TEST_ROOT=str(self.root),
            BACKEND_PORT='8080', JUMIN_VIEWPORT_CACHE_ENABLED='false', PARKING_AVAILABILITY_ENABLED='false',
        )

    def write_binary(self, name, body):
        path = self.root / 'bin' / name
        path.write_text(body)
        path.chmod(0o755)

    def deploy(self, *arguments):
        self.state_file.write_text(json.dumps(self.state))
        result = subprocess.run(
            ['bash', str(REPOSITORY / 'infra/scripts/deploy-backend.sh'), 'dev', *arguments],
            env=self.environment, capture_output=True, text=True, timeout=10,
        )
        self.state = json.loads(self.state_file.read_text())
        return result

    def test_replaces_single_backend_without_proxy_or_slots(self):
        result = self.deploy()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.state['image'], f'jumin-backend:{RELEASE_ID}')
        self.assertEqual(self.current.resolve().name, RELEASE_ID)
        self.assertFalse((self.root / 'proxy').exists())
        calls = self.calls.read_text()
        self.assertIn('http://127.0.0.1:8080/actuator/health', calls)
        for operation in ('nginx', 'backend-blue', 'backend-green', 'docker exec', 'docker update'):
            self.assertNotIn(operation, calls)

    def test_unhealthy_new_image_restores_previous_image_and_keeps_release_link(self):
        self.state['unhealthy_images'] = [f'jumin-backend:{RELEASE_ID}']

        result = self.deploy()

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.state['image'], f'jumin-backend:{OLD_RELEASE_ID}')
        self.assertEqual(self.current.resolve(), self.old_release)
        self.assertIn('Restoring previous backend image.', result.stderr)

    def test_compose_failure_restores_previous_image(self):
        self.state['failed_images'] = [f'jumin-backend:{RELEASE_ID}']

        result = self.deploy()

        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.state['image'], f'jumin-backend:{OLD_RELEASE_ID}')
        self.assertEqual(self.current.resolve(), self.old_release)

    def test_failed_first_install_does_not_publish_release(self):
        self.current.unlink()
        self.state.update(image=None, unhealthy_images=[f'jumin-backend:{RELEASE_ID}'])

        result = self.deploy()

        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.current.exists())
        self.assertNotIn('Restoring previous backend image.', result.stderr)

    def test_slot_rollback_is_rejected_in_dev(self):
        result = self.deploy('rollback', 'backend-blue')

        self.assertEqual(result.returncode, 2)
        self.assertEqual(self.state['image'], f'jumin-backend:{OLD_RELEASE_ID}')
        self.assertFalse(self.calls.exists())

    def test_redis_tls_overlay_only_targets_single_backend(self):
        # Redis 접속만 대체하고, 운영 슬롯 overlay가 개발 배포에 섞이지 않는지 확인한다.
        self.write_binary('python3', '#!/bin/sh\nexit 0\n')
        self.environment.update(
            JUMIN_VIEWPORT_CACHE_ENABLED='true', JUMIN_VIEWPORT_CACHE_REDISUSERNAME='test',
            JUMIN_VIEWPORT_CACHE_REDISPASSWORD='test-password', VIEWPORT_REDIS_TLS_CA_PEM='test-ca',
        )

        result = self.deploy()

        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls.read_text()
        self.assertIn('docker-compose.viewport.yml', calls)
        self.assertNotIn('docker-compose.viewport.prod.yml', calls)
        self.assertEqual((self.current / 'redis-ca.pem').read_text(), 'test-ca\n')


if __name__ == '__main__':
    unittest.main()
