import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { lstat, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Diagnostics } from '../../diagnostics.mjs';
import { parseOptions } from '../../options.mjs';

const fixture = new URL('../../scenarios/nearby-parking.html', import.meta.url);

// 진단 기록은 검토된 가상 데이터에서만 선택적으로 남기며 모델의 추론이나 민감한 입력을 제외한다.
test('스냅샷, 도구 호출, 토큰 수를 기록하고 추론과 임의 입력은 가린다', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumin-diag-unit-'));
  try {
    const options = parseOptions(['--scenario', 'select-parking', '--diagnostics'], {});
    const recorder = new Diagnostics(options, performance.now(), root);
    await recorder.authorize(await readFile(fixture));
    recorder.fixtureOrigin = 'http://127.0.0.1:1234';
    const unsafeUrl = recorder.safeArgs({ url: 'https://example.com/path?token=synthetic-secret' });
    assert.equal(unsafeUrl.url, '[가상 범위 외 주소 가림]');
    assert.equal(unsafeUrl.urlMetadata.origin, 'external');
    assert.equal(unsafeUrl.urlMetadata.hasQuery, true);
    assert.equal(JSON.stringify(unsafeUrl).includes('synthetic-secret'), false);
    assert.equal(
      recorder.safeArgs({ url: 'http://127.0.0.1:1234/results' }).url,
      'http://127.0.0.1:1234/results',
    );
    const snapshot = '- textbox "목적지" [ref=e1]: 가상역';
    recorder.modelRequest(1, [{ role: 'user', content: `과제\n\n현재 화면:\n${snapshot}` }]);
    recorder.modelResponse(
      1,
      {
        message: {
          content: '기록하면 안 되는 자연어 원문',
          thinking: '기록하면 안 되는 내부 추론',
          tool_calls: [
            { function: { name: 'browser_type', arguments: { target: 'e1', text: '가상역' } } },
          ],
        },
        prompt_eval_count: 23,
        eval_count: 7,
        done_reason: 'stop',
      },
      42,
    );
    recorder.modelResponse(
      2,
      {
        message: {
          tool_calls: [
            {
              function: {
                name: 'browser_type',
                arguments: { target: 'e1', text: 'sample.person@example.com' },
              },
            },
          ],
        },
      },
      10,
    );
    recorder.event('tool_completed', {
      mcpResult: `Bearer sk-abcdefghijklmnop ${os.homedir()} sample.person@example.com`,
    });
    const saved = await recorder.save({ termination: 'model_stopped', modelClaim: null });
    const raw = await readFile(saved.file, 'utf8');
    const record = JSON.parse(raw);
    assert.equal(record.events[0].snapshots[0].text, snapshot);
    assert.equal(record.events[1].toolCalls[0].arguments.text, '가상역');
    assert.equal(record.events[1].usage.prompt_eval_count, 23);
    assert.equal(record.events[1].usage.eval_count, 7);
    assert.equal(record.events[2].toolCalls[0].arguments.text, '[가상 입력 외 값 가림]');
    assert.doesNotMatch(
      raw,
      /기록하면 안 되는 자연어 원문|기록하면 안 되는 내부 추론|sample\.person@example\.com|sk-abcdefghijklmnop/,
    );
    assert.equal(raw.includes(os.homedir()), false);
    assert.equal((await lstat(saved.file)).mode & 0o077, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('승인되지 않은 화면과 심볼릭 링크 출력 디렉터리는 거부한다', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumin-diag-scope-'));
  try {
    const options = parseOptions(['--scenario', 'select-parking', '--diagnostics'], {});
    const refused = new Diagnostics(options, performance.now(), path.join(root, 'refused'));
    await assert.rejects(refused.authorize(Buffer.from('가상 화면이 아닌 내용')));
    assert.equal((await refused.save({})).status, 'refused');

    const link = path.join(root, 'link');
    await symlink(root, link);
    const recorder = new Diagnostics(options, performance.now(), link);
    await recorder.authorize(await readFile(fixture));
    await assert.rejects(recorder.save({}));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('진단 출력은 기본값에서 꺼져 있고 Git과 포맷 검사가 출력 경로를 무시한다', async () => {
  assert.equal(parseOptions([], {}).diagnostics, false);
  assert.equal(parseOptions(['--diagnostics'], {}).diagnostics, true);
  const root = fileURLToPath(new URL('../../', import.meta.url));
  await promisify(execFile)('git', ['check-ignore', '-q', 'diagnostics/example.json'], {
    cwd: root,
  });
  const prettierIgnore = await readFile(new URL('../../.prettierignore', import.meta.url), 'utf8');
  assert.match(prettierIgnore, /^diagnostics\/$/m);
  // 프런트 포맷 검사의 대상 디렉터리 밖에 진단 출력이 있는지도 확인한다.
  const frontend = fileURLToPath(new URL('../../../../client/', import.meta.url));
  const output = path.join(root, 'diagnostics', 'example.json');
  assert.match(path.relative(frontend, output), /^\.\.[\\/]/);
});
