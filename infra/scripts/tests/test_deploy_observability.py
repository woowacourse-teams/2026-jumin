import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest

REPOSITORY = Path(__file__).resolve().parents[3]


# 실제 workflow 셸을 실행해 최초 수집기 이전과 일반 앱 배포의 선행 조건을 구분한다.
class ObservabilityOrderingTest(unittest.TestCase):
    def run_prepare(self, environment, staged, legacy_running):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            routing = root / 'proxy/backend-routing'
            routing.mkdir(parents=True)
            if staged:
                (routing / 'active.conf').write_text('~^ http://backend-blue:8080;\n')
            binary = root / 'bin'
            binary.mkdir()
            docker = binary / 'docker'
            docker.write_text('#!/bin/sh\nif [ "$1" = inspect ]; then printf "%s\\n" "$LEGACY_RUNNING"; else echo 127.0.0.1:18080; fi\n')
            docker.chmod(0o755)
            curl = binary / 'curl'
            curl.write_text('#!/bin/sh\nexit 0\n')
            curl.chmod(0o755)
            scripts = root / 'infra/observability/scripts'
            scripts.mkdir(parents=True)
            # 수집기 전용 실패를 재현한다. 정상 앱 배포에서는 이 단계가 실행되면 안 된다.
            (scripts / 'install-credentials.sh').write_text('exit 42\n')

            workflow = (REPOSITORY / f'.github/workflows/server-{environment}-cd.yml').read_text()
            prepare = workflow.split('        id: prepare_alloy\n', 1)[1]
            shell = textwrap.dedent(prepare.split('        run: |\n', 1)[1].split('\n      - name:', 1)[0])
            shell = shell.replace(f'/opt/jumin-{environment}', str(root))
            result = subprocess.run(
                ['bash', '-e', '-o', 'pipefail', '-c', shell], cwd=root,
                env=dict(os.environ, PATH=str(binary) + os.pathsep + os.environ['PATH'],
                         LEGACY_RUNNING=str(legacy_running).lower(), GITHUB_OUTPUT=str(root / 'output')),
                capture_output=True, text=True,
            )
            self.assertLess(workflow.index('Deploy backend with Docker Compose'), workflow.index('Update Alloy collector'))
            return result

    def test_steady_state_does_not_gate_backend_on_alloy_reinstallation(self):
        result = self.run_prepare('prod', staged=True, legacy_running=False)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_first_legacy_switch_requires_successful_observability_migration(self):
        result = self.run_prepare('prod', staged=False, legacy_running=True)
        self.assertEqual(result.returncode, 42, result.stderr)

    def test_cold_backend_bootstrap_can_precede_alloy_setup(self):
        result = self.run_prepare('prod', staged=False, legacy_running=False)
        self.assertEqual(result.returncode, 0, result.stderr)


# 실제 수집기 배포 셸을 임시 경로에서 실행하고 Docker와 권한 변경만 대체한다.
class AlloyConfigurationTest(unittest.TestCase):
    def render(self, environment):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary = root / 'bin'
            binary.mkdir()
            for name in ('sudo', 'docker'):
                path = binary / name
                path.write_text('#!/bin/sh\nexit 0\n')
                path.chmod(0o755)
            (root / 'ingest_password').write_text('test-password')
            source = (REPOSITORY / 'infra/observability/scripts/deploy-alloy.sh').read_text()
            source_dir = REPOSITORY / 'infra/observability/alloy'
            source = '\n'.join(
                f'source_dir="{source_dir}"' if line.startswith('source_dir=') else line
                for line in source.splitlines()
            ).replace('root=/opt/jumin-alloy', f'root="{root}"')
            script = root / 'deploy-alloy.sh'
            script.write_text(source)

            result = subprocess.run(
                ['bash', str(script), environment], capture_output=True, text=True,
                env=dict(os.environ, PATH=str(binary) + os.pathsep + os.environ['PATH']),
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            return (root / 'config/config.alloy').read_text()

    def test_dev_scrapes_single_backend_directly(self):
        config = self.render('dev')

        self.assertIn('__address__ = "127.0.0.1:8080"', config)
        self.assertIn('matches    = "CONTAINER_NAME=jumin-backend-dev"', config)
        self.assertNotIn('backend-dev-blue', config)
        self.assertNotIn('backend-dev-green', config)
        self.assertNotIn('__BACKEND_', config)

    def test_prod_scrapes_active_slot_through_proxy_and_collects_both_logs(self):
        config = self.render('prod')

        self.assertIn('__address__ = "127.0.0.1:18080"', config)
        for name in ('jumin-backend-prod', 'jumin-backend-prod-blue', 'jumin-backend-prod-green'):
            self.assertIn(f'CONTAINER_NAME={name}', config)
        self.assertNotIn('__BACKEND_', config)


if __name__ == '__main__':
    unittest.main()
