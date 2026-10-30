import os
from pathlib import Path
import subprocess
import tempfile
import unittest

REPOSITORY = Path(__file__).resolve().parents[3]

class BackendDeploymentTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        binaries = self.root / 'bin'
        binaries.mkdir()
        self.calls = self.root / 'calls'
        self.write_binary(binaries / 'flock', 'exit 0\n')
        self.write_binary(binaries / 'sleep', 'exit 0\n')
        self.write_binary(binaries / 'docker', '''if [ "$1" = inspect ]; then echo jumin-backend:previous; exit 0; fi
if [ "$1" = compose ]; then printf '%s %s\\n' "${IMAGE_TAG:-}" "$*" >> "$TEST_CALLS"; fi
exit 0
''')
        self.write_binary(binaries / 'curl', '''if [ "${TEST_FAIL_NEW:-false}" = true ] && ! tail -1 "$TEST_CALLS" | grep -q '^previous '; then exit 22; fi
exit 0
''')
        self.artifact = self.root / 'artifact'
        self.artifact.mkdir()
        (self.artifact / 'app.jar').write_bytes(b'unit-test-artifact')
        self.environment = dict(os.environ, PATH=str(binaries)+os.pathsep+os.environ['PATH'],
            GITHUB_WORKSPACE=str(REPOSITORY), GITHUB_SHA='a'*40, GITHUB_RUN_ID='12', GITHUB_RUN_ATTEMPT='1',
            BACKEND_ARTIFACT_DIR=str(self.artifact), BACKEND_RELEASE_ROOT=str(self.root / 'release'),
            BACKEND_PORT='8080', TEST_CALLS=str(self.calls), JUMIN_VIEWPORT_CACHE_ENABLED='false')

    def tearDown(self):
        self.temporary.cleanup()

    @staticmethod
    def write_binary(path, body):
        path.write_text('#!/bin/sh\n'+body)
        path.chmod(0o755)

    def run_deployment(self):
        return subprocess.run(['bash', str(REPOSITORY/'infra/scripts/deploy-backend.sh'), 'dev'],
            env=self.environment, capture_output=True, text=True)

    def test_success_uses_existing_deployment_without_database_role_files(self):
        result = self.run_deployment()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.root/'release/current').is_symlink())
        self.assertNotIn('docker-compose.viewport.yml', self.calls.read_text())
        self.assertFalse(list((self.root/'release').rglob('redis-ca.pem')))

    def test_failed_health_restores_previous_image_and_reports_failure(self):
        self.environment['TEST_FAIL_NEW'] = 'true'
        result = self.run_deployment()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('previous ', self.calls.read_text())
        self.assertFalse((self.root/'release/current').exists())

    def test_invalid_activation_flag_fails_before_replacing_backend(self):
        self.environment['JUMIN_VIEWPORT_CACHE_ENABLED'] = 'invalid'
        result = self.run_deployment()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.calls.exists())

    def test_failed_redis_preflight_does_not_replace_backend_or_log_password(self):
        password = 'test-password-must-not-be-logged'
        self.environment.update(JUMIN_VIEWPORT_CACHE_ENABLED='true', JUMIN_VIEWPORT_CACHE_REDISUSERNAME='viewport',
            JUMIN_VIEWPORT_CACHE_REDISPASSWORD=password, VIEWPORT_REDIS_TLS_CA_PEM='test-public-certificate',
            JUMIN_VIEWPORT_CACHE_REDISURI='rediss://10.0.100.241:6379')
        self.write_binary(self.root/'bin/python3', 'exit 1\n')
        result = self.run_deployment()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.calls.exists())
        self.assertNotIn(password, result.stdout+result.stderr)

if __name__ == '__main__':
    unittest.main()
