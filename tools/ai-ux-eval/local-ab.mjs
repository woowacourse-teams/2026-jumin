import { createHash, randomBytes } from 'node:crypto';
import {
  compareDataFingerprints,
  compareCoreParking,
  compareTransactionPair,
} from './local-data-fingerprint.mjs';
import { analyzeAbPairs } from './local-ab-analysis.mjs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseOptions } from './options.mjs';
import { runLocalSmoke } from './local-smoke.mjs';
import { createLocalReport, markdownLocalReport } from './local-report.mjs';
import { saveReportFiles } from './report-common.mjs';
import { allowedDevBackend } from './local-safety.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const personas = ['baseline', 'price', 'walking'];
const commonFailures = new Set([
  'environment_error',
  'safety_probe_failed',
  'policy_violation',
  'frontend_error',
  'frontend_port_in_use',
  'analytics_setup_error',
  'map_sdk_error',
  'backend_error',
  'backend_unavailable',
  'app_page_unavailable',
  'app_frame_unavailable',
  'frame_state_unavailable',
  'search_input_unavailable',
  'model_conflict',
  'feature_unavailable',
  'browser_disconnected',
  'mcp_disconnected',
  'transport_error',
]);

// 코드만 해시한다. 환경 파일, 경로, 실제 데이터와 의존성은 결과에 싣지 않는다.
export async function fingerprintClient(directory) {
  const hash = createHash('sha256');
  let files = 0;
  async function visit(name) {
    const full = path.join(directory, name);
    const info = await stat(full).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!info) return;
    if (info.isDirectory()) {
      for (const child of (await readdir(full, { withFileTypes: true })).sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        if (child.isSymbolicLink()) throw Error('버전 소스의 심볼릭 링크는 지원하지 않습니다.');
        if (!child.name.startsWith('.')) await visit(path.join(name, child.name));
      }
    } else if (info.isFile()) {
      hash.update(name);
      hash.update('\0');
      hash.update(await readFile(full));
      hash.update('\0');
      files++;
    }
  }
  for (const entry of [
    'src',
    'public',
    'index.html',
    'package.json',
    'pnpm-lock.yaml',
    'vite.config.ts',
    'tsconfig.json',
  ])
    await visit(entry);
  if (!files) throw Error('버전 소스를 찾을 수 없습니다.');
  return hash.digest('hex');
}

// 각 실행은 기존 실행기를 호출하므로 각자 새 세션과 동일한 요청 차단을 사용한다.
export async function compareLocalVersions(
  options,
  {
    versions,
    executionOrder = ['A:baseline', 'A:price', 'A:walking', 'B:baseline', 'B:price', 'B:walking'],
    run = runLocalSmoke,
    fingerprint = fingerprintClient,
    signal,
    env = process.env,
    onProgress = () => {},
  } = {},
) {
  if (
    options.mode !== 'local' ||
    !['local-one-hour-parking', 'local-select-parking'].includes(options.scenario.id) ||
    !Array.isArray(versions) ||
    versions.length !== 2 ||
    versions.some(
      (v, i) =>
        v.id !== ['A', 'B'][i] ||
        v.scenarioReady !== true ||
        v.changeReviewed !== true ||
        v.dataSourceReviewed !== true ||
        typeof v.clientDirectory !== 'string',
    )
  )
    throw Error('검토된 두 화면 버전과 과제 준비 상태가 필요합니다.');
  const expected = ['A', 'B'].flatMap((id) => personas.map((p) => `${id}:${p}`));
  if (
    !Array.isArray(executionOrder) ||
    executionOrder.length !== 6 ||
    new Set(executionOrder).size !== 6 ||
    executionOrder.some((item) => !expected.includes(item))
  )
    throw Error('실행 순서는 두 버전 × 세 조건을 정확히 한 번씩 포함해야 합니다.');
  const directories = await Promise.all(versions.map((v) => realpath(v.clientDirectory)));
  if (directories[0] === directories[1]) throw Error('두 화면 버전은 서로 다른 소스여야 합니다.');
  for (const dir of directories) {
    for (const required of ['src', 'package.json', 'node_modules'])
      if (!(await stat(path.join(dir, required), { throwIfNoEntry: false })))
        throw Error('화면 버전 실행 환경이 준비되지 않았습니다.');
  }
  const initialHashes = await Promise.all(directories.map(fingerprint));
  if (initialHashes.some((h) => !/^[a-f0-9]{64}$/.test(h)) || initialHashes[0] === initialHashes[1])
    throw Error('구분 가능한 두 화면 버전이 필요합니다.');
  const definitions = JSON.parse(await readFile(path.join(root, 'personas.json'), 'utf8'));
  const runs = [];
  const fingerprints = [];
  const dataFingerprintKey = randomBytes(32);
  let stopped = null;
  outer: for (const entry of executionOrder) {
    const [version, persona] = entry.split(':');
    const i = version === 'A' ? 0 : 1;
    if (signal?.aborted) {
      stopped = 'interrupted';
      break outer;
    }
    if ((await fingerprint(directories[i])) !== initialHashes[i]) {
      stopped = 'screen_changed';
      break outer;
    }
    const selected = { ...options, persona: { id: persona, ...definitions[persona] } };
    onProgress({ version: versions[i].id, persona, phase: 'start' });
    const result = await run(selected, {
      clientDirectory: directories[i],
      signal,
      env,
      dataFingerprintKey,
    });
    fingerprints.push(result.dataFingerprint);
    const unchanged = (await fingerprint(directories[i])) === initialHashes[i];
    const safe = createLocalReport(result, { options: selected, source: 'local_run' });
    runs.push({
      version: versions[i].id,
      sourceCommit: /^[a-f0-9]{40}$/.test(versions[i].commit || '') ? versions[i].commit : null,
      versionReview: {
        scenarioReady: true,
        changeReviewed: true,
        dataSourceReviewed: true,
        approvalBasis:
          versions[i].humanReview === 'approved_scope_and_limits'
            ? 'user_approved_preparation_and_limits'
            : null,
        humanExecutionClaimed: false,
      },
      screenSha256: initialHashes[i],
      screenUnchanged: unchanged,
      dataCoverage: result.dataFingerprint
        ? {
            complete: result.dataFingerprint.complete === true,
            coreComplete: result.dataFingerprint.core?.complete === true,
            coreCount: Number.isSafeInteger(result.dataFingerprint.core?.count)
              ? result.dataFingerprint.core.count
              : null,
            count: Number.isSafeInteger(result.dataFingerprint.count)
              ? result.dataFingerprint.count
              : null,
            coverage: Object.fromEntries(
              ['viewport', 'destinationSearch', 'parkingSearch', 'mapResource', 'other'].map(
                (key) => [
                  key,
                  Number.isSafeInteger(result.dataFingerprint.coverage?.[key])
                    ? result.dataFingerprint.coverage[key]
                    : null,
                ],
              ),
            ),
          }
        : null,
      result: safe,
    });
    onProgress({ version: versions[i].id, persona, phase: 'end' });
    if (!unchanged) {
      stopped = 'screen_changed';
      break outer;
    }
    if (result.cleanupErrors?.length) {
      stopped = 'cleanup_error';
      break outer;
    }
    if (commonFailures.has(result.termination)) {
      stopped = result.termination;
      break outer;
    }
  }
  const digests = runs.map((r) => r.result.modelInfo.digest);
  const sameModel =
    digests.length === 6 && digests.every(Boolean) ? digests.every((d) => d === digests[0]) : null;
  const origin = allowedDevBackend(String(env.API_PROXY_TARGET || ''));
  const backend =
    origin === 'https://dev.jucha.info'
      ? 'dev'
      : origin === 'https://origin-dev.jucha.info'
        ? 'origin_dev'
        : origin
          ? 'local_test'
          : 'unverified';
  const transactions = compareDataFingerprints(fingerprints);
  const coreComparisons = Object.fromEntries(
    personas.map((persona) => {
      const ai = runs.findIndex((run) => run.version === 'A' && run.result.persona === persona);
      const bi = runs.findIndex((run) => run.version === 'B' && run.result.persona === persona);
      return [
        persona,
        ai >= 0 && bi >= 0 ? compareCoreParking(fingerprints[ai], fingerprints[bi]) : 'unavailable',
      ];
    }),
  );
  const transactionComparisons = Object.fromEntries(
    personas.map((persona) => {
      const ai = runs.findIndex((run) => run.version === 'A' && run.result.persona === persona);
      const bi = runs.findIndex((run) => run.version === 'B' && run.result.persona === persona);
      return [
        persona,
        ai >= 0 && bi >= 0
          ? compareTransactionPair(fingerprints[ai], fingerprints[bi])
          : 'unavailable',
      ];
    }),
  );
  dataFingerprintKey.fill(0);
  const pairs = analyzeAbPairs(runs, coreComparisons, backend, transactionComparisons);
  const comparable =
    transactions === 'same' &&
    pairs.every((pair) => pair.interpretation === 'within_observed_scope');
  const hasBehavior = pairs.some((pair) => pair.behaviorComparison === 'comparable');
  return {
    scope: 'real_screen_ab_smoke_not_experiment',
    scenario: options.scenario.id,
    plannedOrder: [...executionOrder],
    actualOrder: runs.map((r) => `${r.version}:${r.result.persona}`),
    backend,
    transactionSet:
      transactions === 'same'
        ? 'same_transactions'
        : transactions === 'different'
          ? 'transaction_difference'
          : 'unavailable',
    dataSnapshot: 'unverified',
    comparability: comparable ? 'comparable' : hasBehavior ? 'limited' : 'unavailable',
    comparisonReasons: [
      '전체 트랜잭션 차이는 세션 헤더·추가 요청·응답 차이 중 어느 것인지 단정하지 않는다.',
      '핵심 조회는 주차 검색 쿼리와 상태·본문만 비교하며 세션 헤더와 서비스 전체 데이터는 검증하지 않는다.',
      '지도 리소스 오류가 관찰된 경우 화면에 미친 영향은 미확인이다.',
      '문맥 토큰 보고값만으로 실제 잘림 여부를 판단하지 않는다.',
      '조건별 한 번의 결과로 화면의 우열을 판단하지 않는다.',
    ],
    sameModel,
    complete: runs.length === 6 && stopped === null,
    stopped,
    pairs,
    runs,
  };
}
export function markdownLocalAb(report) {
  return [
    '# 실제 화면 A/B 연결 점검',
    '',
    '과거 제품 변경 재현을 위한 개발용 점검이며 새 기능 효과·실제 사용자 행동·일반 성공률을 입증하지 않는다.',
    '외부 설문은 차단되며 modal-focus-v3는 이 설문을 보완하며 개발됐다. 현재 dev 데이터와 복제 의존성을 사용한다.',
    '실행 전체 시간에는 준비·브라우저·검증, 모델 추론과 도구 대기가 포함된다.',
    `계획 순서: ${(report.plannedOrder || []).join(' → ')} / 실제 순서: ${(report.actualOrder || []).join(' → ')}`,
    '',
    `완료: ${report.complete} / 비교 가능성: ${report.comparability} / 백엔드: ${report.backend} / 전체 트랜잭션: ${report.transactionSet} / 데이터 스냅샷: 미확인 / 중단: ${report.stopped ?? '없음'}`,
    '',
    ...report.comparisonReasons.map((x) => `- ${x}`),
    '',
    ...report.pairs.map(
      (p) =>
        `- ${p.persona}: 행동 ${p.behaviorComparison}, 독립 판정 ${p.independentOutcomeComparison}, 전체 요청 ${p.transactionComparison}, 핵심 조회 ${p.coreParkingComparison}, 지도 ${p.mapResources.A}/${p.mapResources.B}, 추가 조회 ${p.extraLookupCounts.A ?? '미확인'}/${p.extraLookupCounts.B ?? '미확인'}, 문맥 토큰 ${p.contextReports.A}/${p.contextReports.B}, 해석 ${p.interpretation}, 문제 후보 A ${p.runs.A.issues.join(', ') || '없음'} / B ${p.runs.B.issues.join(', ') || '없음'}`,
    ),
    '',
    ...report.runs.flatMap((r) => [
      `## 화면 ${r.version}`,
      `커밋: ${r.sourceCommit ?? '미확인'}`,
      `소스 SHA-256: ${r.screenSha256} / 실행 중 동일: ${r.screenUnchanged}`,
      `사람의 준비 확인: ${JSON.stringify(r.versionReview)}`,
      `조회 범위·수: ${r.dataCoverage ? JSON.stringify(r.dataCoverage) : '미확인'}`,
      '',
      markdownLocalReport(r.result),
    ]),
  ].join('\n');
}
export async function saveLocalAb(report, outputRoot = path.join(root, 'reports')) {
  const runs = (Array.isArray(report.runs) ? report.runs : []).slice(0, 6).map((run) => {
    if (!['A', 'B'].includes(run.version) || !/^[a-f0-9]{64}$/.test(run.screenSha256 || ''))
      throw Error('버전 증거 오류');
    const raw = run.result;
    const result = createLocalReport(
      {
        ...raw,
        mode: 'local',
        actionEvents: raw.actions,
        safety: { ...raw.safety, mapResults: raw.mapResults },
      },
      {
        options: {
          scenario: { id: raw.scenario, goal: raw.goal },
          modelOptions: raw.modelOptions,
          think: raw.modelOptions?.think,
        },
        source: 'local_run',
      },
    );
    return {
      version: run.version,
      sourceCommit: /^[a-f0-9]{40}$/.test(run.sourceCommit || '') ? run.sourceCommit : null,
      versionReview: {
        approvalBasis:
          run.versionReview?.approvalBasis === 'user_approved_preparation_and_limits'
            ? 'user_approved_preparation_and_limits'
            : null,
        humanExecutionClaimed: false,
        scenarioReady: run.versionReview?.scenarioReady === true,
        changeReviewed: run.versionReview?.changeReviewed === true,
        dataSourceReviewed: run.versionReview?.dataSourceReviewed === true,
      },
      screenSha256: run.screenSha256,
      screenUnchanged: run.screenUnchanged === true,
      dataCoverage: run.dataCoverage
        ? {
            complete: run.dataCoverage.complete === true,
            coreComplete: run.dataCoverage.coreComplete === true,
            coreCount: Number.isSafeInteger(run.dataCoverage.coreCount)
              ? run.dataCoverage.coreCount
              : null,
            count: Number.isSafeInteger(run.dataCoverage.count) ? run.dataCoverage.count : null,
            coverage: Object.fromEntries(
              ['viewport', 'destinationSearch', 'parkingSearch', 'mapResource', 'other'].map(
                (key) => [
                  key,
                  Number.isSafeInteger(run.dataCoverage.coverage?.[key])
                    ? run.dataCoverage.coverage[key]
                    : null,
                ],
              ),
            ),
          }
        : null,
      result,
    };
  });
  const digests = runs.map((run) => run.result.modelInfo.digest);
  const backend = ['dev', 'origin_dev', 'local_test'].includes(report.backend)
    ? report.backend
    : 'unverified';
  const coreComparisons = Object.fromEntries(
    personas.map((persona) => {
      const original = report.pairs?.find((p) => p.persona === persona)?.coreParkingComparison;
      const a = runs.find((r) => r.version === 'A' && r.result.persona === persona),
        b = runs.find((r) => r.version === 'B' && r.result.persona === persona);
      return [
        persona,
        a?.dataCoverage?.coreComplete &&
        b?.dataCoverage?.coreComplete &&
        a.dataCoverage.coreCount > 0 &&
        b.dataCoverage.coreCount > 0 &&
        ['same_query_same_response', 'same_query_different_response', 'different_request'].includes(
          original,
        )
          ? original
          : 'unavailable',
      ];
    }),
  );
  const transactionComparisons = Object.fromEntries(
    personas.map((persona) => {
      const original = report.pairs?.find((p) => p.persona === persona)?.transactionComparison;
      const a = runs.find((r) => r.version === 'A' && r.result.persona === persona);
      const b = runs.find((r) => r.version === 'B' && r.result.persona === persona);
      return [
        persona,
        a?.dataCoverage?.complete &&
        b?.dataCoverage?.complete &&
        ['same_transactions', 'transaction_difference'].includes(original)
          ? original
          : 'unavailable',
      ];
    }),
  );
  const pairs = analyzeAbPairs(runs, coreComparisons, backend, transactionComparisons);
  const safe = {
    scope: 'real_screen_ab_smoke_not_experiment',
    scenario: ['local-one-hour-parking', 'local-select-parking'].includes(report.scenario)
      ? report.scenario
      : null,
    plannedOrder:
      Array.isArray(report.plannedOrder) &&
      report.plannedOrder.length === 6 &&
      new Set(report.plannedOrder).size === 6 &&
      report.plannedOrder.every((x) => /^[AB]:(baseline|price|walking)$/.test(x))
        ? [...report.plannedOrder]
        : [],
    actualOrder: runs.map((r) => `${r.version}:${r.result.persona}`),
    backend,
    transactionSet: ['same_transactions', 'transaction_difference'].includes(report.transactionSet)
      ? report.transactionSet
      : 'unavailable',
    dataSnapshot: 'unverified',
    comparability:
      report.transactionSet === 'same_transactions' &&
      pairs.every((p) => p.interpretation === 'within_observed_scope')
        ? 'comparable'
        : pairs.some((p) => p.behaviorComparison === 'comparable')
          ? 'limited'
          : 'unavailable',
    comparisonReasons: [
      '전체 트랜잭션 차이는 세션 헤더·추가 요청·응답 차이 중 어느 것인지 단정하지 않는다.',
      '핵심 조회는 주차 검색 쿼리와 상태·본문만 비교하며 세션 헤더와 서비스 전체 데이터는 검증하지 않는다.',
      '지도 리소스 오류가 관찰된 경우 화면에 미친 영향은 미확인이다.',
      '문맥 토큰 보고값만으로 실제 잘림 여부를 판단하지 않는다.',
      '조건별 한 번의 결과로 화면의 우열을 판단하지 않는다.',
    ],
    sameModel:
      digests.length === 6 && digests.every(Boolean)
        ? digests.every((d) => d === digests[0])
        : null,
    complete: runs.length === 6 && !report.stopped,
    stopped:
      typeof report.stopped === 'string' && /^[a-z_]+$/.test(report.stopped)
        ? report.stopped
        : null,
    pairs,
    runs,
  };
  return saveReportFiles({
    root: outputRoot,
    prefix: 'local-',
    report: safe,
    markdown: markdownLocalAb(safe),
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      strict: true,
      options: {
        config: { type: 'string' },
        scenario: { type: 'string', default: 'local-one-hour-parking' },
        'local-url': { type: 'string', default: 'http://localhost:3000' },
        'ollama-url': { type: 'string', default: 'http://127.0.0.1:11435' },
        'num-predict': { type: 'string', default: '1024' },
      },
    });
    if (!values.config) throw Error('두 버전 설정이 필요합니다.');
    const config = JSON.parse(await readFile(values.config, 'utf8'));
    const options = parseOptions(
      [
        '--mode',
        'local',
        '--local-url',
        values['local-url'],
        '--scenario',
        values.scenario,
        '--model',
        'qwen3.5:9b',
        '--ollama-url',
        values['ollama-url'],
        '--num-predict',
        values['num-predict'],
      ],
      process.env,
    );
    const controller = new AbortController();
    for (const event of ['SIGINT', 'SIGTERM', 'SIGHUP'])
      process.once(event, () => controller.abort());
    const report = await compareLocalVersions(options, {
      versions: config.versions,
      executionOrder: config.order,
      signal: controller.signal,
      onProgress: ({ version, persona, phase }) =>
        console.error(`화면 ${version} / ${persona}: ${phase === 'start' ? '시작' : '종료'}`),
    });
    const output = await saveLocalAb(report);
    console.log(
      JSON.stringify({
        complete: report.complete,
        stopped: report.stopped,
        comparability: report.comparability,
        output: path.relative(root, output),
      }),
    );
    if (!report.complete) process.exitCode = 1;
  } catch {
    console.error('두 화면 버전 또는 실행 환경을 확인해주세요.');
    process.exitCode = 1;
  }
}
