import importlib.util
import json
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

PATH = Path(__file__).resolve().parents[1] / 'deploy-redis-ssm.py'
SPEC = importlib.util.spec_from_file_location('redis_deployment', PATH)
DEPLOY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DEPLOY)

class RedisSsmDeploymentTest(unittest.TestCase):
    def test_sends_public_code_to_selected_instance_and_waits_for_success(self):
        requests = []
        def fake_aws(*arguments):
            if arguments[0] == 'send-command':
                location = arguments[arguments.index('--cli-input-json')+1]
                requests.append(json.loads(Path(location.removeprefix('file://')).read_text()))
                return subprocess.CompletedProcess(arguments, 0, '12345678-1234-1234-1234-123456789abc', '')
            return subprocess.CompletedProcess(arguments, 0, json.dumps({'Status':'Success','ResponseCode':0}), '')
        with patch.dict(os.environ, {'REDIS_EC2_INSTANCE_ID':'i-0123456789abcdef0',
                'VIEWPORT_REDIS_URI':'rediss://10.0.100.241:6379', 'VIEWPORT_REDIS_PASSWORD':'never-send-this-secret'}), \
             patch('sys.argv', ['deploy-redis-ssm.py','dev']), patch.object(DEPLOY, 'aws', side_effect=fake_aws):
            DEPLOY.main()
        self.assertEqual(requests[0]['InstanceIds'], ['i-0123456789abcdef0'])
        self.assertEqual(requests[0]['DocumentName'], 'AWS-RunShellScript')
        self.assertNotIn('never-send-this-secret', json.dumps(requests))

    def test_rejects_uri_credentials_before_sending_command(self):
        with patch.dict(os.environ, {'REDIS_EC2_INSTANCE_ID':'i-0123456789abcdef0',
                'VIEWPORT_REDIS_URI':'rediss://viewport:secret@10.0.100.241:6379'}), \
             patch('sys.argv',['deploy-redis-ssm.py','dev']), patch.object(DEPLOY,'aws') as aws:
            with self.assertRaises(ValueError): DEPLOY.main()
            aws.assert_not_called()

    def test_remote_failure_fails_deployment(self):
        results=[subprocess.CompletedProcess([],0,'12345678-1234-1234-1234-123456789abc',''),
                 subprocess.CompletedProcess([],0,json.dumps({'Status':'Failed','ResponseCode':1}),'')]
        with patch.dict(os.environ, {'REDIS_EC2_INSTANCE_ID':'i-0123456789abcdef0',
                'VIEWPORT_REDIS_URI':'rediss://10.0.100.51:6379'}), \
             patch('sys.argv',['deploy-redis-ssm.py','prod']), patch.object(DEPLOY,'aws',side_effect=results):
            with self.assertRaisesRegex(RuntimeError, 'failed'): DEPLOY.main()

if __name__ == '__main__':
    unittest.main()
