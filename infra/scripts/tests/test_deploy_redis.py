import hashlib
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time
import unittest

REPOSITORY = Path(__file__).resolve().parents[3]


class RedisDeploymentTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.binaries = self.root / 'bin'
        self.binaries.mkdir()
        self.calls = self.root / 'calls'
        self.artifact = self.root / 'artifact'
        self.artifact.mkdir()
        for name in ('Dockerfile', 'deploy.sh'):
            shutil.copyfile(REPOSITORY / 'infra/redis' / name, self.artifact / name)
        self.write_checksums()
        self.bootstrap = self.root / 'redis'
        self.bootstrap.mkdir()
        self.override = self.bootstrap / 'ci-compose.override.yml'
        for name in ('compose.yaml', 'redis.conf', 'runtime/server.crt',
                     'runtime/server.key', 'runtime/users.acl', 'secrets/admin.secret'):
            path = self.bootstrap / name
            path.parent.mkdir(exist_ok=True)
            path.write_text('node-local-secret-must-not-be-logged')
        self.write_binary('flock', 'exit "${TEST_LOCK_RESULT:-0}"\n')
        self.write_binary('sleep', 'exit 0\n')
        self.write_binary('docker', '''printf '%s\\n' "$*" >> "$TEST_CALLS"
case "$*" in
  build*) [ "${TEST_FAIL:-}" != build ] ;;
  *' up --detach --no-deps redis')
    [ "${TEST_ROLLBACK_FAIL:-false}" != true ] || exit 1
    if [ ! -f "$TEST_FIRST_START" ]; then
      touch "$TEST_FIRST_START"
      [ "${TEST_FAIL:-}" != up ] || exit 1
      if [ "${TEST_FAIL:-}" = interrupt ]; then /bin/sleep 30; fi
    fi
    ;;
  *' exec '*)
    [ "${TEST_FAIL:-}" != probe ] || exit 1
    printf 'PONG\\n'
    ;;
esac
''')
        self.environment = dict(os.environ,
            PATH=str(self.binaries) + os.pathsep + os.environ['PATH'],
            REDIS_DEPLOY_ROOT=str(self.bootstrap), TEST_CALLS=str(self.calls),
            REDIS_ARTIFACT_DIR=str(self.artifact),
            GITHUB_SHA='a' * 40, GITHUB_RUN_ID='12', GITHUB_RUN_ATTEMPT='1',
            TEST_FIRST_START=str(self.root / 'first-start'),
            VIEWPORT_REDIS_URI='rediss://10.0.100.241:6379')

    def tearDown(self):
        self.temporary.cleanup()

    def write_binary(self, name, body):
        path = self.binaries / name
        path.write_text('#!/bin/sh\n' + body)
        path.chmod(0o755)

    def run_deployment(self, *arguments):
        return subprocess.run(['bash', str(self.artifact / 'deploy.sh'), *arguments],
            env=self.environment, capture_output=True, text=True)

    def write_checksums(self):
        lines = [hashlib.sha256((self.artifact / name).read_bytes()).hexdigest() + '  ' + name
                 for name in ('Dockerfile', 'deploy.sh')]
        (self.artifact / 'redis-artifact.sha256').write_text('\n'.join(lines) + '\n')

    def test_success_deploys_selected_environment_and_verifies_tls_without_logging_secret(self):
        for environment in ('dev', 'prod'):
            with self.subTest(environment=environment):
                self.environment['VIEWPORT_REDIS_URI'] = 'rediss://redis.internal:6379/'
                result = self.run_deployment(environment)
                self.assertEqual(result.returncode, 0, result.stderr)
                calls = self.calls.read_text()
                self.assertIn('--project-name jumin-redis-' + environment, calls)
                self.assertIn('--tag jumin-redis:' + 'a' * 40 + '-12-1', calls)
                self.assertIn('--build-arg REDIS_COMMIT_SHA=' + 'a' * 40, calls)
                self.assertNotIn(str(self.bootstrap), calls.splitlines()[0])
                self.assertIn('image: jumin-redis:' + 'a' * 40 + '-12-1', self.override.read_text())
                self.assertIn('pull_policy: never', self.override.read_text())
                self.assertIn('up --detach --no-deps redis', calls)
                self.assertIn('redis-cli --tls --cacert', calls)
                self.assertIn('sh redis.internal', calls)
                self.assertNotIn('node-local-secret-must-not-be-logged', result.stdout + result.stderr + calls)

    def test_invalid_endpoint_or_arguments_fail_before_docker_without_logging_credentials(self):
        for endpoint in ('', 'redis://10.0.100.241:6379',
                         'rediss://viewport:secret-must-not-be-logged@10.0.100.241:6379',
                         'rediss://10.0.100.241:6380', 'rediss://10.0.100.241:6379/0',
                         'rediss://10.0.100.241:6379?query', 'rediss://:6379'):
            with self.subTest(endpoint=endpoint):
                self.environment['VIEWPORT_REDIS_URI'] = endpoint
                result = self.run_deployment('dev')
                self.assertEqual(result.returncode, 2)
                self.assertFalse(self.calls.exists())
                self.assertNotIn('secret-must-not-be-logged', result.stdout + result.stderr)
        self.environment['VIEWPORT_REDIS_URI'] = 'rediss://10.0.100.241:6379'
        for arguments in ((), ('production',), ('dev', 'extra')):
            with self.subTest(arguments=arguments):
                self.assertEqual(self.run_deployment(*arguments).returncode, 2)
                self.assertFalse(self.calls.exists())

    def test_missing_bootstrap_fails_before_docker(self):
        (self.bootstrap / 'runtime/server.key').unlink()
        result = self.run_deployment('dev')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.calls.exists())

    def test_corrupted_or_missing_artifact_fails_before_docker(self):
        dockerfile = self.artifact / 'Dockerfile'
        dockerfile.write_text('FROM tampered-image\n')
        result = self.run_deployment('dev')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.calls.exists())
        dockerfile.unlink()
        result = self.run_deployment('dev')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.calls.exists())

    def test_incomplete_manifest_fails_before_docker(self):
        manifest = self.artifact / 'redis-artifact.sha256'
        manifest.write_text(manifest.read_text().splitlines()[0] + '\n')
        result = self.run_deployment('dev')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.calls.exists())

    def test_missing_or_invalid_delivery_settings_fail_before_docker(self):
        invalid_settings = [('REDIS_ARTIFACT_DIR', ''), ('GITHUB_SHA', ''),
                            ('GITHUB_SHA', 'invalid'), ('GITHUB_RUN_ID', ''),
                            ('GITHUB_RUN_ID', 'invalid'), ('GITHUB_RUN_ATTEMPT', ''),
                            ('GITHUB_RUN_ATTEMPT', '-1')]
        for name, value in invalid_settings:
            with self.subTest(setting=name, value=value):
                previous = self.environment[name]
                self.environment[name] = value
                try:
                    result = self.run_deployment('dev')
                    self.assertNotEqual(result.returncode, 0)
                    self.assertFalse(self.calls.exists())
                finally:
                    self.environment[name] = previous

    def test_build_failure_keeps_existing_compose_configuration_without_restarting_redis(self):
        self.override.write_text('previous')
        self.environment['TEST_FAIL'] = 'build'
        result = self.run_deployment('dev')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.override.read_text(), 'previous')
        self.assertNotIn(' up ', self.calls.read_text())

    def test_start_failure_restores_previous_compose_configuration(self):
        previous = 'services:\n  redis:\n    image: redis:previous\n'
        self.override.write_text(previous)
        self.environment['TEST_FAIL'] = 'up'
        result = self.run_deployment('dev')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.override.read_text(), previous)
        self.assertTrue(self.calls.read_text().splitlines()[-1].endswith('up --detach --no-deps redis'))
        self.assertFalse(list(self.bootstrap.glob('.redis-compose-previous.*')))

    def test_rollback_failure_keeps_previous_configuration_backup(self):
        self.override.write_text('previous')
        self.environment['TEST_ROLLBACK_FAIL'] = 'true'
        result = self.run_deployment('dev')
        self.assertNotEqual(result.returncode, 0)
        backups = list(self.bootstrap.glob('.redis-compose-previous.*'))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(), 'previous')
        self.assertIn('Redis rollback failed', result.stderr)

    def test_termination_restores_previous_configuration_and_reports_failure(self):
        self.override.write_text('previous')
        self.environment['TEST_FAIL'] = 'interrupt'
        process = subprocess.Popen(['bash', str(self.artifact / 'deploy.sh'), 'dev'],
            env=self.environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, start_new_session=True)
        try:
            for _ in range(500):
                if (self.root / 'first-start').exists():
                    break
                if process.poll() is not None:
                    self.fail('Deployment exited before starting Redis')
                time.sleep(0.01)
            else:
                self.fail('Deployment did not start Redis in time')
            os.killpg(process.pid, signal.SIGTERM)
            process.communicate(timeout=5)
            self.assertEqual(process.returncode, 143)
            self.assertEqual(self.override.read_text(), 'previous')
            self.assertFalse(list(self.bootstrap.glob('.redis-compose-previous.*')))
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.communicate()

    def test_failed_tls_probe_removes_first_override_and_restores_base_compose(self):
        self.environment['TEST_FAIL'] = 'probe'
        result = self.run_deployment('dev')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.override.exists())
        self.assertEqual(self.calls.read_text().splitlines()[-1],
            'compose --project-name jumin-redis-dev --file compose.yaml up --detach --no-deps redis')

    def test_active_deployment_lock_prevents_docker_and_configuration_changes(self):
        self.environment['TEST_LOCK_RESULT'] = '1'
        self.override.write_text('previous')
        result = self.run_deployment('dev')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.calls.exists())
        self.assertEqual(self.override.read_text(), 'previous')


if __name__ == '__main__':
    unittest.main()
