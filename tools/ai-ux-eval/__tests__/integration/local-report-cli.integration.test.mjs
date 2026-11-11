import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const directory = fileURLToPath(new URL('../..', import.meta.url));
const cli = path.join(directory, 'local-report.mjs');
const runner = path.join(directory, 'runner.mjs');
const exec = promisify(execFile);

test('구조화 결과를 모델 없이 가져와 비공개 보고서로 저장하고 출처를 구분한다', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumin-report-cli-'));
  let output;
  try {
    const input = path.join(root, 'input.json');
    await writeFile(
      input,
      JSON.stringify({
        mode: 'local',
        scenario: 'local-open-search',
        persona: 'baseline',
        model: 'qwen3.5:9b',
        modelClaim: true,
        verification: 'passed',
        verificationReason: 'search_screen_observed',
        finalState: {},
        actionEvents: [
          {
            tool: 'browser_type',
            target: 'secret-target',
            outcome: 'success',
            text: 'secret-input',
          },
        ],
        key: 'secret-key',
        snapshot: 'secret-snapshot',
        url: 'https://secret.invalid/?key=secret-key',
      }),
    );
    const { stdout, stderr } = await exec(process.execPath, [cli, '--input', input]);
    assert.equal(stderr, '');
    const metadata = JSON.parse(stdout);
    assert.equal(metadata.source, 'imported_unverified');
    output = path.resolve(directory, metadata.output);
    assert.equal(path.dirname(output), path.join(directory, 'reports'));
    const saved = JSON.parse(await readFile(path.join(output, 'result.json'), 'utf8'));
    const markdown = await readFile(path.join(output, 'report.md'), 'utf8');
    assert.equal(saved.modelClaim, true);
    assert.equal(saved.verification, 'unavailable');
    assert.equal(saved.finalState.searchInputVisible, null);
    assert.equal(saved.actions[0].target, 'unavailable');
    assert.equal(saved.source, 'imported_unverified');
    assert.match(markdown, /출처와 독립 검증 실행 여부/);
    assert.doesNotMatch(
      JSON.stringify(saved) + markdown + stdout,
      /secret-|secret\.invalid|https?:\/\//,
    );
    assert.equal((await stat(output)).mode & 0o777, 0o700);
    assert.equal((await stat(path.join(output, 'result.json'))).mode & 0o777, 0o600);
    await writeFile(
      input,
      JSON.stringify({ mode: 'local', scenario: 'select-parking', persona: 'price' }),
    );
    await assert.rejects(
      exec(process.execPath, [cli, '--input', input]),
      (error) => error.code === 1 && /지원하지 않는/.test(error.stderr),
    );
  } finally {
    if (output) await rm(output, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test('실행기 보고서 옵션은 필수 환경 오류도 모델 호출 없이 미확인으로 저장한다', async () => {
  let output;
  try {
    let failure;
    try {
      await exec(
        process.execPath,
        [
          runner,
          '--mode',
          'local',
          '--local-url',
          'http://localhost:3000',
          '--model',
          'qwen3.5:9b',
          '--ollama-url',
          'http://127.0.0.1:1',
          '--timeout-seconds',
          '5',
          '--report',
        ],
        {
          env: {
            ...process.env,
            NAVER_MAP_CLIENT_ID: '',
            API_PROXY_TARGET: 'https://dev.jucha.info',
          },
        },
      );
      assert.fail('필수 환경이 없는데 성공으로 종료됨');
    } catch (error) {
      failure = error;
    }
    assert.equal(failure.code, 1);
    const result = JSON.parse(failure.stdout);
    assert.equal(result.termination, 'environment_error');
    assert.equal(result.report.status, 'saved');
    output = path.resolve(directory, result.report.output);
    assert.equal(path.dirname(output), path.join(directory, 'reports'));
    const saved = JSON.parse(await readFile(path.join(output, 'result.json'), 'utf8'));
    assert.equal(saved.source, 'local_run');
    assert.equal(saved.verification, 'unavailable');
    assert.equal(saved.finalState.surveyDialogVisible, null);
    assert.equal(saved.finalState.searchInputVisible, null);
    assert.equal(saved.modelOptions.num_ctx, 4096);
    assert.ok(saved.startedAt);
  } finally {
    if (output) await rm(output, { recursive: true, force: true });
  }
});
