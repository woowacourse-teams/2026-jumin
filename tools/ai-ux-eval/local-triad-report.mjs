import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalReport, markdownLocalReport } from './local-report.mjs';
import { saveReportFiles } from './report-common.mjs';

// 실행별 안전 보고서를 다시 허용 목록에 통과시켜 세 조건 보고서로 묶는다.
export function createTriadReport(rawReports, { invalidateWalking = false } = {}) {
  if (!Array.isArray(rawReports) || rawReports.length !== 3)
    throw Error('세 조건의 결과가 필요합니다.');
  if (rawReports.some((input) => input?.source !== 'local_run'))
    throw Error('직접 실행 결과만 묶을 수 있습니다.');
  const reports = rawReports.map((input) =>
    createLocalReport(
      {
        ...input,
        mode: 'local',
        actionEvents: input.actions,
        safety: { ...input.safety, mapResults: input.mapResults },
      },
      {
        options: {
          scenario: { id: input.scenario, goal: input.goal },
          modelOptions: input.modelOptions,
          think: input.modelOptions?.think,
        },
        source: 'local_run',
      },
    ),
  );
  if (
    reports.some((r) => r.scenario !== 'local-one-hour-parking') ||
    new Set(reports.map((r) => r.persona)).size !== 3 ||
    !['baseline', 'price', 'walking'].every((p) => reports.some((r) => r.persona === p))
  )
    throw Error('시나리오 또는 조건이 일치하지 않습니다.');
  reports.sort(
    (a, b) =>
      ['baseline', 'price', 'walking'].indexOf(a.persona) -
      ['baseline', 'price', 'walking'].indexOf(b.persona),
  );
  if (invalidateWalking) {
    for (const report of reports) {
      if (report.parkingEvidence?.candidateComparison)
        report.parkingEvidence.candidateComparison.walking = {
          result: 'unavailable',
          missing: null,
          minimumTies: null,
        };
    }
  }
  const sameKnown = (values) =>
    values.some((v) => v === null || v === undefined)
      ? null
      : new Set(values.map(JSON.stringify)).size === 1;
  const consistency = {
    goal: sameKnown(reports.map((r) => r.goal)),
    screenVersion: sameKnown(reports.map((r) => r.screenVersion)),
    interactionPolicy: sameKnown(reports.map((r) => r.interactionPolicy)),
    contextPolicy: reports.every((r) => r.contextPolicy !== 'unavailable')
      ? sameKnown(reports.map((r) => r.contextPolicy))
      : null,
    modelDigest: sameKnown(reports.map((r) => r.modelInfo.digest)),
    modelOptions: sameKnown(reports.map((r) => r.modelOptions)),
    limits: sameKnown(reports.map((r) => r.limits)),
  };
  return {
    scope: 'real_screen_development_smoke_not_ab_test',
    walkingMetricInvalidated: invalidateWalking,
    consistency,
    limitations: [
      '실제 A/B 실험이나 실제 사용자 행동이 아니며 일반적인 성공률로 해석하지 않는다.',
      '서로 다른 실행 사이에 dev 데이터가 바뀌었을 수 있다.',
      '후보 목록의 상대 순위는 모델이 정보를 읽거나 비교했다는 증거가 아니다.',
      ...(reports.some(
        (run) =>
          Number.isSafeInteger(run.modelOptions?.num_ctx) &&
          run.modelCalls.some(
            (call) =>
              Number.isSafeInteger(call.inputTokens) && call.inputTokens > run.modelOptions.num_ctx,
          ),
      )
        ? [
            'API가 보고한 일부 요청의 입력 토큰 수가 num_ctx 설정보다 크다. 그 수치만으로 모델 문맥 보존이나 잘림 여부를 확정할 수 없다.',
          ]
        : []),
      '이전 기준 성공 기록에는 후보별 비교 근거가 없어 직접 비교하지 않는다.',
      ...(invalidateWalking
        ? [
            '이번 실행의 도보거리 추출기는 일부 목록 행의 값을 읽지 못했다. 원본은 저장되지 않아 누락 수와 최저 여부를 미확인으로 처리한다.',
          ]
        : []),
    ],
    runs: reports,
  };
}
export function markdownTriadReport(report) {
  return [
    '# 실제 1시간 화면 연결 점검',
    '',
    `조건 일치 여부: ${JSON.stringify(report.consistency)}`,
    '',
    ...report.limitations.map((x) => `- ${x}`),
    '',
    ...report.runs.map((run) => markdownLocalReport(run)),
  ].join('\n');
}
export async function saveTriadReport(
  report,
  root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'reports'),
) {
  const safe = createTriadReport(report.runs, {
    invalidateWalking: report.walkingMetricInvalidated === true,
  });
  return saveReportFiles({
    root,
    prefix: 'local-',
    report: safe,
    markdown: markdownTriadReport(safe),
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const invalidateWalking = process.argv.includes('--invalidate-walking');
    const input = process.argv.slice(2).filter((arg) => arg !== '--invalidate-walking');
    if (input.length !== 3) throw Error('세 결과 경로가 필요합니다.');
    const reports = await Promise.all(
      input.map(async (p) => JSON.parse(await readFile(p, 'utf8'))),
    );
    const output = await saveTriadReport(createTriadReport(reports, { invalidateWalking }));
    console.log(
      JSON.stringify({
        status: 'saved',
        output: path.relative(path.dirname(fileURLToPath(import.meta.url)), output),
      }),
    );
  } catch {
    console.error('조건 보고서 생성 실패');
    process.exitCode = 1;
  }
}
