import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parseOptions } from '../../options.mjs';

// 잘못된 실행 조건은 브라우저나 모델을 시작하기 전에 거부한다.
test('시나리오, 모델 및 제한을 CLI에서 선택한다', () => {
  const options = parseOptions(
    [
      '--scenario',
      'nearby-parking',
      '--persona',
      'price',
      '--model',
      'qwen3:4b',
      '--max-actions',
      '7',
      '--max-consecutive-errors',
      '2',
      '--timeout-seconds',
      '25',
      '--num-predict',
      '512',
    ],
    {},
  );
  assert.equal(options.scenario.id, 'nearby-parking');
  assert.equal(options.persona.id, 'price');
  assert.equal(options.model, 'qwen3:4b');
  assert.equal(options.maxActions, 7);
  assert.equal(options.maxConsecutiveErrors, 2);
  assert.equal(options.timeoutMs, 25_000);
  assert.equal(options.modelOptions.num_predict, 512);
});

test('없는 시나리오, 잘못된 제한, 외부 모델 주소와 알 수 없는 옵션을 거부한다', () => {
  for (const args of [
    ['--scenario', 'missing'],
    ['--persona', 'missing'],
    ['--max-actions', '0'],
    ['--max-actions', '1.5'],
    ['--max-consecutive-errors', '0'],
    ['--max-consecutive-errors', '21'],
    ['--timeout-seconds', '-1'],
    ['--timeout-seconds', '3601'],
    ['--num-predict', '0'],
    ['--num-predict', '4097'],
    ['--ollama-url', 'https://example.com'],
    ['--ollama-url', 'http://user:secret@127.0.0.1:11434'],
    ['--model', ''],
    ['--unknown'],
  ]) {
    assert.throws(() => parseOptions(args, {}));
  }
});

test('로컬 스모크는 기준 조건과 명시 모델·루프백 주소만 허용하고 진단 저장을 거부한다', () => {
  const base = ['--mode', 'local', '--local-url', 'http://127.0.0.1:3000', '--model', 'qwen3.5:9b'];
  const options = parseOptions(base, {});
  assert.equal(options.mode, 'local');
  assert.equal(options.scenario.id, 'local-open-search');
  assert.equal(options.localUrl, 'http://127.0.0.1:3000/');
  for (const args of [
    [...base, '--diagnostics'],
    [...base, '--persona', 'price'],
    [...base, '--scenario', 'select-parking'],
    ['--mode', 'local', '--local-url', 'https://example.com', '--model', 'qwen3.5:9b'],
    ['--mode', 'local', '--local-url', 'http://127.0.0.1:3000'],
    ['--mode', 'fixture', '--local-url', 'http://127.0.0.1:3000'],
  ])
    assert.throws(() => parseOptions(args, {}));
});

test('CLI는 잘못된 제한을 입력 오류 종료 코드로 돌려준다', async () => {
  const runner = fileURLToPath(new URL('../../runner.mjs', import.meta.url));
  await assert.rejects(
    promisify(execFile)(process.execPath, [runner, '--max-actions', '0']),
    (error) => error.code === 2 && /입력 오류/.test(error.stderr),
  );
});

test('존재하지 않는 페르소나는 모델 연결 전에 입력 오류로 끝난다', async () => {
  const runner = fileURLToPath(new URL('../../runner.mjs', import.meta.url));
  await assert.rejects(
    promisify(execFile)(process.execPath, [runner, '--persona', 'missing']),
    (error) => error.code === 2 && /페르소나/.test(error.stderr),
  );
});
