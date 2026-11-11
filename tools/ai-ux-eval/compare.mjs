import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseOptions } from './options.mjs';
import { runEvaluation, validateVerification } from './evaluation.mjs';
import { commonIndependentFields, commonRunFields, saveReportFiles } from './report-common.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const personas = ['baseline', 'price', 'walking'];
const versions = ['fixture-a', 'fixture-b'];
const allowedTools = new Set([
  'browser_snapshot',
  'browser_click',
  'browser_type',
  'browser_navigate',
  'report_completion',
]);
const targets = new Set([
  '목적지 입력란',
  '주차장 검색 버튼',
  '가람 주차장 선택 버튼',
  '다온 주차장 선택 버튼',
  '검색 화면으로 이동 링크',
  'unavailable',
]);
const observedValues = new Set([
  '목적지 입력란: 가상역',
  '검색 목적지: 가상역',
  '가람 주차장 선택 표시',
  '다온 주차장 선택 표시',
  '미선택 표시',
]);
function safeState(value) {
  return {
    screen: ['search', 'results', 'no_results', 'unavailable'].includes(value?.screen)
      ? value.screen
      : 'unavailable',
    observed: Array.isArray(value?.observed)
      ? value.observed.filter((item) => observedValues.has(item))
      : [],
  };
}
function safeAction(value) {
  return {
    turn: Number.isSafeInteger(value.turn) && value.turn > 0 ? value.turn : null,
    tool: value.tool,
    before: safeState(value.before),
    target: targets.has(value.target) ? value.target : 'unavailable',
    input: ['가상역', 'other_or_unavailable'].includes(value.input) ? value.input : null,
    outcome: [
      'success',
      'mcp_error',
      'mcp_success_snapshot_unavailable',
      'aborted',
      'browser_disconnected',
      'mcp_disconnected',
      'forbidden_access',
      'tool_timeout',
      'snapshot_error',
      'transport_error',
      'unavailable',
    ].includes(value.outcome)
      ? value.outcome
      : 'unavailable',
    after: safeState(value.after),
  };
}

// 두 가상 버전은 실제 A/B가 아닌 실행기 검증용이다.
export async function compareFixtures(options, { run = runEvaluation, signal } = {}) {
  if (options.mode !== 'fixture' || options.scenario.id !== 'select-parking' || options.diagnostics)
    throw new Error('가상 비교 설정을 확인해주세요.');
  const files = ['scenarios/nearby-parking.html', 'scenarios/nearby-parking-b.html'];
  const hashes = await Promise.all(
    files.map(async (file) =>
      createHash('sha256')
        .update(await readFile(path.join(directory, file)))
        .digest('hex'),
    ),
  );
  const definitions = JSON.parse(await readFile(path.join(directory, 'personas.json'), 'utf8'));
  const runs = [];
  outer: for (const [index, version] of versions.entries()) {
    for (const persona of personas) {
      if (signal?.aborted) break outer;
      const selected = {
        ...options,
        fixtureVersion: version,
        fixtureEvidence: true,
        persona: { id: persona, ...definitions[persona] },
      };
      let result;
      try {
        result = await run(selected, { signal });
      } catch {
        result = {};
      }
      let verified = null;
      try {
        if (result.screenSha256 !== hashes[index]) throw new Error('screen_version_unverified');
        verified = validateVerification(result, 'parking-selection');
      } catch {
        /* 증거가 부족하면 판정 불가다. */
      }
      runs.push({
        screenVersion: version,
        screenSha256: /^[a-f0-9]{64}$/.test(result.screenSha256 || '') ? result.screenSha256 : null,
        expectedScreenSha256: hashes[index],
        scenario: options.scenario.id,
        persona,
        modelDigest: /^[a-f0-9]{64}$/i.test(result.modelDigest || '') ? result.modelDigest : null,
        ...commonRunFields(result),
        ...commonIndependentFields(
          verified,
          result.screenSha256 !== hashes[index]
            ? 'screen_version_unverified'
            : result.verificationReason === 'verifier_error'
              ? 'verifier_error'
              : 'insufficient_evidence',
        ),
        destinationStatus: verified?.destinationStatus ?? 'unavailable',
        selectedParking: verified?.selectedParking ?? null,
        preference:
          verified &&
          ['matched', 'not_matched', 'not_applicable', 'unavailable'].includes(
            result.preference?.status,
          )
            ? result.preference.status
            : 'unavailable',
        comparisonEvidence: 'not_assessed',
        actions: Number.isInteger(result.actions) ? result.actions : 0,
        decisions: Array.isArray(result.decisions)
          ? result.decisions
              .filter((x) => allowedTools.has(x.tool))
              .map((x) => ({
                turn: x.turn,
                tool: x.tool,
                previousToolResults: x.previousToolResults,
              }))
          : [],
        actionEvidence: Array.isArray(result.actionEvidence)
          ? result.actionEvidence.filter((entry) => allowedTools.has(entry.tool)).map(safeAction)
          : [],
        cleanupErrors: Array.isArray(result.cleanupErrors)
          ? result.cleanupErrors.filter((x) => ['browser', 'server', 'profile', 'mcp'].includes(x))
          : [],
      });
    }
  }
  return {
    scope: 'synthetic_fixture_development_only',
    model: options.model,
    scenario: options.scenario.id,
    goal: options.scenario.goal,
    limits: {
      maxActions: options.maxActions,
      maxConsecutiveErrors: options.maxConsecutiveErrors,
      timeoutMs: options.timeoutMs,
      think: options.think,
      modelOptions: options.modelOptions,
    },
    complete: runs.length === 6,
    runs,
  };
}

export function markdownReport(report) {
  const rows = report.runs.map(
    (r) =>
      `| ${r.screenVersion} | ${r.persona} | ${r.modelClaim === null ? '미보고' : r.modelClaim ? '성공' : '미완료'} | ${r.verification} | ${r.verificationReason} | ${r.selectedParking || '없음/미확인'} | ${r.termination} | ${r.decisions.map((d) => d.tool).join(' → ') || '없음'} |`,
  );
  const details = report.runs.flatMap((run) => [
    `### ${run.screenVersion} · ${run.persona}`,
    '',
    ...(run.actionEvidence.length
      ? run.actionEvidence.map(
          (action) =>
            `- ${action.turn ?? '?'}: ${action.before.screen} / ${action.tool} / 대상 ${action.target}${action.input ? ` / 입력 ${action.input}` : ''} / ${action.outcome} / 이후 ${action.after.screen}${action.after.observed.length ? ` (${action.after.observed.join(', ')})` : ''}`,
        )
      : ['- 행동 근거 없음']),
    '',
  ]);
  return [
    '# 가상 화면 실행기 개발 검증',
    '',
    '실제 주민 화면 A/B나 실제 사용자 결과가 아니다.',
    '',
    `공통 과제: ${report.goal}`,
    '',
    `모델: ${report.model}`,
    '',
    '| 화면 | 조건 | 자기 보고 | 독립 판정 | 판정 근거 | 선택 | 종료 | 행동 요약 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## 행동 근거',
    '',
    ...details,
    '화면 해시·실행 제한·선호와 세부 행동은 JSON에 기록한다. 선택만으로 정보를 읽거나 비교했다고 판단하지 않는다.',
    '',
  ].join('\n');
}

export async function saveComparison(report, root = path.join(directory, 'reports')) {
  return saveReportFiles({ root, prefix: 'fixture-', report, markdown: markdownReport(report) });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(signal, stop);
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      strict: true,
      options: {
        model: { type: 'string' },
        'ollama-url': { type: 'string' },
        'max-actions': { type: 'string' },
        'max-consecutive-errors': { type: 'string' },
        'timeout-seconds': { type: 'string' },
      },
    });
    const args = ['--scenario', 'select-parking'];
    for (const [key, value] of Object.entries(values))
      if (value !== undefined) args.push(`--${key}`, value);
    const report = await compareFixtures(parseOptions(args), { signal: controller.signal });
    const output = await saveComparison(report);
    console.log(
      JSON.stringify({
        scope: report.scope,
        runs: report.runs.length,
        output: path.relative(directory, output),
      }),
    );
    if (
      !report.complete ||
      report.runs.some((r) => r.verification !== 'passed' || r.cleanupErrors.length)
    )
      process.exitCode = 1;
  } catch {
    console.error('가상 비교 설정 또는 결과 저장을 확인해주세요.');
    process.exitCode = 1;
  } finally {
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.removeListener(signal, stop);
  }
}
