#!/usr/bin/env python3
"""Dispatch public deployment code through SSM; Redis passwords remain on the target host."""
import base64
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlsplit


def aws(*arguments):
    return subprocess.run(['aws', 'ssm', *arguments], text=True, capture_output=True)


def main():
    environment = sys.argv[1] if len(sys.argv) == 2 else ''
    instance = os.environ.get('REDIS_EC2_INSTANCE_ID', '')
    uri = urlsplit(os.environ.get('VIEWPORT_REDIS_URI', ''))
    if environment not in ('dev', 'prod') or not re.fullmatch(r'i-[0-9a-f]{17}', instance):
        raise ValueError('Invalid Redis environment or instance ID.')
    if uri.scheme != 'rediss' or not uri.hostname or uri.username or uri.password or uri.query or uri.fragment or uri.path not in ('', '/') or uri.port != 6379:
        raise ValueError('VIEWPORT_REDIS_URI must be a credential-free rediss endpoint on port 6379.')
    source = Path(__file__).resolve().parents[1] / 'redis' / 'deploy.sh'
    encoded = base64.b64encode(source.read_bytes()).decode()
    command = ("set -eu; deploy_file=$(mktemp); trap 'rm -f \"$deploy_file\"' EXIT; "
               + 'printf %s ' + shlex.quote(encoded) + ' | base64 -d > "$deploy_file"; '
               + 'bash "$deploy_file" ' + shlex.quote(environment) + ' ' + shlex.quote(uri.hostname))
    request = {'DocumentName': 'AWS-RunShellScript', 'InstanceIds': [instance],
               'Comment': 'jumin Redis ' + environment + ' deployment',
               'TimeoutSeconds': 60, 'Parameters': {'commands': [command], 'executionTimeout': ['180']}}
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json') as payload:
        json.dump(request, payload)
        payload.flush()
        sent = aws('send-command', '--cli-input-json', 'file://' + payload.name,
                   '--query', 'Command.CommandId', '--output', 'text')
    if sent.returncode:
        raise RuntimeError('SSM SendCommand failed; verify AWS credentials and target permissions.')
    command_id = sent.stdout.strip()
    if not re.fullmatch(r'[0-9a-f-]{36}', command_id):
        raise RuntimeError('SSM returned an invalid command ID.')
    print('SSM command: ' + command_id, flush=True)
    for _ in range(80):
        result = aws('get-command-invocation', '--command-id', command_id, '--instance-id', instance, '--output', 'json')
        if result.returncode:
            if 'InvocationDoesNotExist' not in result.stderr:
                raise RuntimeError('Cannot read SSM command result; verify GetCommandInvocation permission.')
        else:
            invocation = json.loads(result.stdout)
            status = invocation.get('Status')
            if status == 'Success' and invocation.get('ResponseCode') == 0:
                print('Redis ' + environment + ' deployment succeeded.')
                return
            if status in ('Failed', 'Cancelled', 'TimedOut', 'Cancelling'):
                raise RuntimeError('Redis deployment failed in SSM: ' + str(status))
        time.sleep(3)
    raise RuntimeError('Timed out waiting for Redis deployment; inspect the SSM command ID above.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, OSError) as failure:
        print(str(failure), file=sys.stderr)
        sys.exit(1)
