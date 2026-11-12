import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest

import test_deploy_backend as backend


# 종료 감시는 이전 요청을 보존하면서 후속 배포와 경합해도 활성 컨테이너를 보호해야 한다.
class DrainCleanupTest(unittest.TestCase):
    def setUp(self):
        self.fixture = backend.BackendDeploymentTest()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.root = self.fixture.root
        self.route = self.fixture.route_file
        self.route.parent.mkdir(parents=True)
        self.route.write_text('~^ http://backend-blue:8080;\n')
        self.snapshot = self.root / 'drain-route.conf'
        os.link(self.route, self.snapshot)
        self.monitor = self.fixture.old_release / 'drain-backend.sh'
        shutil.copyfile(backend.REPOSITORY / 'infra/scripts/drain-backend.sh', self.monitor)
        self.fixture.state.update(
            route='backend-blue', worker=15, keep_old_worker=False,
            running=['jumin-nginx-prod', 'jumin-backend-prod', 'jumin-backend-prod-blue'],
        )

    def run_monitor(self, old_pids='10', generation='jumin-nginx-prod generation-1',
                    container='jumin-backend-prod'):
        self.fixture.state_file.write_text(json.dumps(self.fixture.state))
        return subprocess.run(
            ['bash', str(self.monitor),
             'prod', str(self.fixture.release_root), str(self.snapshot), old_pids,
             generation, container],
            env=self.fixture.environment, capture_output=True, text=True, timeout=5,
        )

    def test_stops_previous_container_after_delayed_request_finishes(self):
        # 첫 검사에서는 이전 요청이 남고, 다음 검사 직전에 완료되는 상황이다.
        self.fixture.state['keep_old_worker'] = True
        self.fixture.write_binary('sleep', f'''#!{backend.sys.executable}
import json
from pathlib import Path
path = Path({str(self.fixture.state_file)!r})
state = json.loads(path.read_text())
state['keep_old_worker'] = False
path.write_text(json.dumps(state))
''')

        result = self.run_monitor()

        self.assertEqual(result.returncode, 0, result.stderr)
        state = json.loads(self.fixture.state_file.read_text())
        self.assertNotIn('jumin-backend-prod', state['running'])
        self.assertIn('jumin-backend-prod-blue', state['running'])
        self.assertFalse(self.snapshot.exists())

    def test_warns_once_after_ten_minutes_and_stops_backend_only_after_drain(self):
        # 경고 시점에도 워커가 남아 있고, 이후 두 번의 검사 사이에 요청이 끝난다.
        self.fixture.state['keep_old_worker'] = True
        clock = self.root / 'clock.sh'
        clock.write_text('SECONDS=600\n')
        self.fixture.environment['BASH_ENV'] = str(clock)
        self.fixture.write_binary('logger', '#!/bin/sh\ncat >> "$TEST_ROOT/journal"\n')
        self.fixture.write_binary('sleep', f'''#!{backend.sys.executable}
import json
from pathlib import Path
root = Path({str(self.root)!r})
state_path = root / 'state.json'
state = json.loads(state_path.read_text())
assert 'jumin-backend-prod' in state['running']
first_poll = root / 'first-poll'
if first_poll.exists():
    state['keep_old_worker'] = False
    state_path.write_text(json.dumps(state))
first_poll.touch()
''')

        result = self.run_monitor(container='backend=jumin-backend-prod')

        journal = self.root / 'journal'
        self.assertTrue(journal.exists(), '드레인 지연 경고가 저널에 기록되어야 한다.')
        entry = journal.read_text()
        self.assertEqual(entry.count('SYSLOG_IDENTIFIER=jumin-backend-drain'), 1)
        self.assertIn('PRIORITY=4\n', entry)
        self.assertIn(f'release={self.monitor.parent.name}', entry)
        self.assertIn('backend=jumin-backend-prod', entry)
        self.assertEqual(result.returncode, 0, result.stderr)
        state = json.loads(self.fixture.state_file.read_text())
        self.assertEqual(state['running'], ['jumin-nginx-prod', 'jumin-backend-prod-blue'])

    def test_new_route_generation_cancels_stale_cleanup_even_for_same_slot(self):
        # 같은 슬롯으로 다시 전환해도 원자 교체된 파일은 새 배포의 소유다.
        replacement = self.root / 'replacement.conf'
        replacement.write_text(self.route.read_text())
        replacement.replace(self.route)

        result = self.run_monitor()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.fixture.calls.exists())
        self.assertFalse(self.snapshot.exists())

    def test_proxy_restart_does_not_confuse_reused_worker_pids(self):
        result = self.run_monitor(old_pids='15', generation='old-proxy generation-0')

        self.assertEqual(result.returncode, 0, result.stderr)
        state = json.loads(self.fixture.state_file.read_text())
        self.assertNotIn('jumin-backend-prod', state['running'])
        self.assertIn('jumin-backend-prod-blue', state['running'])

    def test_waits_for_another_deployment_to_release_the_lock(self):
        # 첫 잠금은 다른 배포가 보유하고, 그 작업이 라우팅을 바꾸는 상황이다.
        self.fixture.write_binary('flock', '#!/bin/sh\nexit 1\n')
        self.fixture.write_binary('sleep', f'''#!{backend.sys.executable}
from pathlib import Path
route = Path({str(self.route)!r})
replacement = route.with_name("next-route")
replacement.write_text(route.read_text())
replacement.replace(route)
''')

        result = self.run_monitor()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.fixture.calls.exists())


if __name__ == '__main__':
    unittest.main()
