import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLocalReport, markdownLocalReport, saveLocalReport } from '../../local-report.mjs';
import { parseOptions } from '../../options.mjs';

const sample = () => ({
  mode: 'local',
  scenario: 'local-open-search',
  persona: 'baseline',
  model: 'qwen3.5:9b',
  modelInfo: { digest: 'd'.repeat(64), runner: 'mlx', quantization: 'nvfp4' },
  modelClaim: true,
  modelCalls: [
    {
      request: 1,
      inputTokens: null,
      outputTokens: 512,
      doneReason: 'length',
      responseKind: 'text',
      elapsedMs: 50,
      content: 'private-model-output',
    },
  ],
  initialScreenEvidence: {
    surveyModal: true,
    surveyClose: true,
    surveyFrame: false,
    surveyFrameContent: 'private-snapshot',
    firstRequestContainsSnapshot: true,
    firstPromptTokens: 1252,
    refCount: 23,
    snapshot: 'private-snapshot',
  },
  decisions: [
    { turn: 1, tool: 'browser_snapshot', previousToolResults: 0, raw: 'private-snapshot' },
    { turn: 2, tool: 'private-tool' },
  ],
  verification: 'not_met',
  verificationReason: 'home_screen_observed',
  finalState: { surveyDialogVisible: true, searchInputVisible: false, searchInputPresent: true },
  actionEvents: [
    {
      tool: 'browser_click',
      target: 'survey_close',
      outcome: 'click_timeout_feedback',
      reference: 'unique',
      location: 'inside_survey_modal',
      state: 'not_marked_disabled',
      ref: 'private-ref',
      args: { text: 'private-input' },
    },
    { tool: 'browser_type', target: 'private-target', outcome: 'success', input: 'private-input' },
  ],
  environment: {
    analyticsOptOut: true,
    mapSdkAvailable: true,
    backendLookupSucceeded: true,
    key: 'private-map-key',
  },
  safety: {
    blockedWrites: 4,
    analyticsAttempts: 0,
    mapResults: [
      {
        kind: 'sdk_script',
        outcome: 'http',
        status: 200,
        count: 1,
        url: 'https://private.example/?key=private-map-key',
      },
    ],
  },
  initialSafety: { blockedWrites: 4 },
  limits: {
    maxActions: 10,
    maxConsecutiveErrors: 3,
    actionTimeoutMs: 5000,
    totalTimeoutMs: 300000,
  },
  elapsedMs: 1234,
  termination: 'model_finished',
  modelRequests: 2,
  modelResponses: 2,
  snapshot: 'private-snapshot',
  screenshot: 'private-screenshot',
  input: 'private-input',
  key: 'private-map-key',
  url: 'https://private.example/?key=private-map-key',
  headers: 'private-headers',
  body: 'private-body',
});
const options = parseOptions(
  ['--mode', 'local', '--local-url', 'http://localhost:3000', '--model', 'qwen3.5:9b', '--report'],
  {},
);

test('자기 보고와 독립 판정을 분리하고 민감한 원문을 허용 목록에서 제외한다', () => {
  const report = createLocalReport(sample(), { options, source: 'local_run' });
  assert.equal(report.modelClaim, true);
  assert.equal(report.verification, 'not_met');
  assert.equal(report.finalState.surveyDialogVisible, true);
  assert.equal(report.modelCalls[0].inputTokens, null);
  assert.equal(report.modelCalls[0].outputTokens, 512);
  assert.equal(report.modelCalls[0].doneReason, 'length');
  assert.equal(report.initialScreenEvidence.surveyFrameContent, 'unavailable');
  assert.equal(report.initialScreenEvidence.firstPromptTokens, 1252);
  assert.equal(report.actions[0].location, 'inside_survey_modal');
  assert.deepEqual(report.actions[1], {
    tool: 'browser_type',
    target: 'unavailable',
    context: 'unavailable',
    reference: 'unavailable',
    location: 'unavailable',
    state: 'unavailable',
    outcome: 'success',
  });
  assert.equal(report.modelOptions.num_ctx, 4096);
  assert.equal(report.mapResults[0].status, 200);
  assert.deepEqual(report.decisions, [
    { turn: 1, tool: 'browser_snapshot', previousToolResults: 0 },
  ]);
  for (const text of [JSON.stringify(report), markdownLocalReport(report)])
    assert.doesNotMatch(text, /private-|private\.example|https?:\/\/|private-ref/);
});

// 과제 주소를 명확히 한 뒤에도 이전 기록의 목표를 새 목표로 바꾸지 않는다.
test('현재와 이전 1시간 과제의 목표를 각각 보존한다', () => {
  const oneHourOptions = parseOptions(
    [
      '--mode',
      'local',
      '--local-url',
      'http://localhost:3000',
      '--scenario',
      'local-one-hour-parking',
      '--model',
      'qwen3.5:9b',
    ],
    {},
  );
  const result = { ...sample(), scenario: 'local-one-hour-parking' };
  const current = createLocalReport(result, { options: oneHourOptions, source: 'local_run' });
  assert.equal(current.goal, oneHourOptions.scenario.goal);
  const oldGoal =
    '서울역을 목적지로 검색하고, 현재 기본 주차 조건에서 주차장 하나를 선택하여 길찾기 앱 선택 화면을 여세요.';
  const legacy = createLocalReport(result, {
    options: { ...oneHourOptions, scenario: { ...oneHourOptions.scenario, goal: oldGoal } },
    source: 'imported_unverified',
  });
  assert.equal(legacy.goal, oldGoal);
});

test('판정 증거가 없거나 모순되면 확인할 수 없는 값은 null과 판정 불가다', () => {
  const missing = {
    ...sample(),
    verification: 'passed',
    verificationReason: 'search_screen_observed',
    finalState: {},
  };
  const report = createLocalReport(missing);
  assert.equal(report.modelClaim, true);
  assert.equal(report.verification, 'unavailable');
  assert.deepEqual(report.finalState, {
    surveyDialogVisible: null,
    searchInputVisible: null,
    searchInputPresent: null,
  });
  assert.equal(report.modelOptions.temperature, null);
  assert.equal(report.goal, null);
  assert.equal(report.source, 'imported_unverified');
  const success = createLocalReport({ ...missing, finalState: { searchInputVisible: true } });
  assert.equal(success.verification, 'passed');
});

test('현재 미지원 실제 시나리오와 요금·도보 페르소나는 거부한다', () => {
  assert.throws(
    () => createLocalReport({ ...sample(), scenario: 'select-parking' }),
    /지원하지 않는/,
  );
  assert.throws(() => createLocalReport({ ...sample(), persona: 'price' }), /지원하지 않는/);
  assert.throws(() => createLocalReport({ ...sample(), persona: 'walking' }), /지원하지 않는/);
  assert.throws(() => parseOptions(['--report'], {}), /local 모드/);
});

test('보고서는 재검열 후 비공개 권한으로 저장하고 심볼릭 링크 출력 루트를 거부한다', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumin-local-report-'));
  try {
    const report = createLocalReport(sample(), { options, source: 'local_run' });
    report.actions.push({
      tool: 'browser_type',
      target: 'private-ref',
      outcome: 'private-input',
      text: 'private-input',
    });
    report.model = 'private-map-key';
    const output = await saveLocalReport(report, root);
    assert.equal((await stat(output)).mode & 0o777, 0o700);
    for (const name of ['result.json', 'report.md']) {
      const file = path.join(output, name);
      assert.equal((await stat(file)).mode & 0o777, 0o600);
      assert.doesNotMatch(await readFile(file, 'utf8'), /private-|private\.example|https?:\/\//);
    }
    const saved = JSON.parse(await readFile(path.join(output, 'result.json'), 'utf8'));
    assert.equal(saved.mapResults[0].status, 200);
    assert.equal(saved.initialSafety.blockedWrites, 4);
    assert.equal(saved.modelOptions.num_ctx, 4096);
    assert.equal(saved.goal, '화면을 이용해 목적지 검색 화면을 여세요.');
    const link = path.join(root, 'link');
    await symlink(root, link);
    await assert.rejects(saveLocalReport(report, link));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
