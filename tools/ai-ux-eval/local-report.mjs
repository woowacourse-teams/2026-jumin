import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  commonIndependentFields,
  commonRunFields,
  nullableBoolean,
  safeCount,
  saveReportFiles,
} from './report-common.mjs';
import { classifyParkingEvidence } from './local-parking-logic.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const tools = new Set(['browser_click', 'browser_type']);
const decisionTools = new Set([
  'browser_click',
  'browser_type',
  'browser_snapshot',
  'browser_navigate',
  'report_completion',
]);
const targets = new Set([
  'survey_close',
  'survey_hide_three_days',
  'search_input',
  'other_button',
  'other_input',
  'other_link',
  'parking_directions',
  'parking_detail',
  'unavailable',
]);
const outcomes = new Set([
  'success',
  'click_timeout',
  'click_timeout_feedback',
  'modal_blocked_feedback',
  'focus_transition',
  'tool_timeout',
  'mcp_error',
  'browser_disconnected',
  'mcp_disconnected',
  'forbidden_access',
  'snapshot_error',
  'transport_error',
  'unavailable',
]);
const terminations = new Set([
  'model_finished',
  'model_stopped',
  'action_limit',
  'consecutive_error_limit',
  'timeout',
  'tool_timeout',
  'environment_error',
  'safety_probe_failed',
  'policy_violation',
  'browser_disconnected',
  'mcp_disconnected',
  'forbidden_access',
  'forbidden_tool',
  'snapshot_error',
  'transport_error',
  'model_error',
  'model_output_limit',
  'model_conflict',
  'frontend_error',
  'frontend_port_in_use',
  'analytics_setup_error',
  'app_page_unavailable',
  'app_frame_unavailable',
  'frame_state_unavailable',
  'map_sdk_error',
  'backend_error',
  'backend_unavailable',
  'search_input_unavailable',
  'interrupted',
  'feature_unavailable',
]);
const finalFields = ['surveyDialogVisible', 'searchInputVisible', 'searchInputPresent'];
const goal = '화면을 이용해 목적지 검색 화면을 여세요.';
const parkingGoal =
  '목적지를 검색하고 2시간 주차 조건을 설정한 뒤, 주차장 하나를 선택하여 길찾기 앱 선택 화면을 여세요.';
const oneHourGoals = new Set([
  '서울역을 목적지로 검색하고, 현재 기본 주차 조건에서 주차장 하나를 선택하여 길찾기 앱 선택 화면을 여세요.',
  '서울역을 검색해 서울 한강대로 405에 있는 서울역을 목적지로 정하고, 현재 기본 주차 조건에서 주차장 하나를 선택하여 길찾기 앱 선택 화면을 여세요.',
]);
const safeTimestamp = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    return null;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) && date.toISOString() === value ? value : null;
};
const safeOptions = (options) => {
  const number = (value, max) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
      ? value
      : null;
  return {
    temperature: number(options?.modelOptions?.temperature, 2),
    num_ctx: number(options?.modelOptions?.num_ctx, 10000000),
    num_predict: number(options?.modelOptions?.num_predict, 10000000),
    think: nullableBoolean(options?.think),
  };
};

// 입력 텍스트·주소·모델 응답·스냅샷을 복사하지 않는 명시적 허용 목록이다.
export function createLocalReport(result, { options, source = 'imported_unverified' } = {}) {
  if (
    !result ||
    result.mode !== 'local' ||
    !['local-open-search', 'local-select-parking', 'local-one-hour-parking'].includes(
      result.scenario,
    ) ||
    !(result.scenario === 'local-open-search'
      ? result.persona === 'baseline'
      : ['baseline', 'price', 'walking'].includes(result.persona))
  )
    throw new Error('지원하지 않는 실제 화면 시나리오 또는 페르소나입니다.');
  if (!['local_run', 'imported_unverified'].includes(source))
    throw new Error('지원하지 않는 결과 출처입니다.');
  const finalState = Object.fromEntries(
    finalFields.map((field) => [field, nullableBoolean(result.finalState?.[field])]),
  );
  let verification = 'unavailable';
  let verificationReason = 'insufficient_evidence';
  let parkingEvidence = null;
  if (
    ['local-select-parking', 'local-one-hour-parking'].includes(result.scenario) &&
    result.parkingEvidence
  ) {
    const e = result.parkingEvidence;
    const checked = classifyParkingEvidence(
      {
        knownEarlyScreen: e.screen === 'early',
        recommendScreen: e.screen === 'recommend',
        duration: e.duration,
        searchSelection: e.searchSelection,
        selectedParking: e.selectedParking,
        directionsDialog: e.directionsDialog,
        destinationMatch: e.destinationMatch,
        destinationNameMatch: e.destinationNameMatch,
        destinationAddressMatch: e.destinationAddressMatch,
        destinationNameKind: e.destinationNameKind,
        candidateComparison: e.candidateComparison,
      },
      result.scenario,
    );
    parkingEvidence = checked.evidence;
    if (
      result.verification === checked.verification &&
      result.verificationReason === checked.verificationReason
    ) {
      verification = checked.verification;
      verificationReason = checked.verificationReason;
    }
  } else if (
    ['local-select-parking', 'local-one-hour-parking'].includes(result.scenario) &&
    result.verification === 'unavailable' &&
    ['not_verified', 'verifier_error', 'insufficient_evidence'].includes(result.verificationReason)
  ) {
    verificationReason = result.verificationReason;
  } else if (result.scenario === 'local-open-search') {
    if (
      result.verification === 'passed' &&
      result.verificationReason === 'search_screen_observed' &&
      finalState.searchInputVisible === true
    ) {
      verification = 'passed';
      verificationReason = 'search_screen_observed';
    } else if (
      result.verification === 'not_met' &&
      result.verificationReason === 'home_screen_observed' &&
      (finalState.searchInputVisible === true ||
        (finalState.searchInputPresent === true && finalState.surveyDialogVisible === true))
    ) {
      verification = 'not_met';
      verificationReason = 'home_screen_observed';
    } else if (
      result.verification === 'unavailable' &&
      ['not_verified', 'verifier_error', 'insufficient_evidence'].includes(
        result.verificationReason,
      )
    ) {
      verificationReason = result.verificationReason;
    }
  }
  const info = result.modelInfo || {};
  const common = commonRunFields(result);
  const safeInfo = (value, allowed) => (allowed.includes(value) ? value : null);
  const actions = Array.isArray(result.actionEvents)
    ? result.actionEvents
        .filter((event) => event && tools.has(event.tool))
        .slice(0, 100)
        .map((event) => ({
          tool: event.tool,
          target: targets.has(event.target) ? event.target : 'unavailable',
          context: ['survey_modal', 'directions_modal', 'unavailable'].includes(event.context)
            ? event.context
            : 'unavailable',
          reference: ['unique', 'ambiguous', 'not_found', 'unavailable'].includes(event.reference)
            ? event.reference
            : 'unavailable',
          location: ['inside_survey_modal', 'outside_survey_modal', 'unavailable'].includes(
            event.location,
          )
            ? event.location
            : 'unavailable',
          state: ['disabled', 'readonly', 'not_marked_disabled', 'unavailable'].includes(
            event.state,
          )
            ? event.state
            : 'unavailable',
          ...(event.focus === 'clicked' ? { focus: 'clicked' } : {}),
          ...(['exact', 'contains', 'different'].includes(event.taskInput)
            ? { taskInput: event.taskInput }
            : {}),
          outcome: outcomes.has(event.outcome) ? event.outcome : 'unavailable',
        }))
    : [];
  const decisions = Array.isArray(result.decisions)
    ? result.decisions
        .filter((decision) => decision && decisionTools.has(decision.tool))
        .slice(0, 101)
        .map((decision) => ({
          turn: safeCount(decision.turn),
          tool: decision.tool,
          previousToolResults: safeCount(decision.previousToolResults),
        }))
    : [];
  const environment = Object.fromEntries(
    [
      'mapKeyConfigured',
      'backendAllowed',
      'modelServerAvailable',
      'modelAvailable',
      'modelToolSupport',
      'modelMetadataAvailable',
      'frontendReady',
      'analyticsOptOut',
      'mapSdkAvailable',
      'backendLookupSucceeded',
    ].map((key) => [key, nullableBoolean(result.environment?.[key])]),
  );
  const safety = Object.fromEntries(
    [
      'analyticsAttempts',
      'blockedWrites',
      'blockedNavigations',
      'blockedRedirects',
      'blockedMethodOverrides',
      'blockedOther',
      'blockedWebSockets',
      'viewportOk',
      'viewportFailed',
    ].map((key) => [key, safeCount(result.safety?.[key])]),
  );
  const initialSafety = Object.fromEntries(
    [
      'analyticsAttempts',
      'blockedWrites',
      'blockedNavigations',
      'blockedRedirects',
      'blockedMethodOverrides',
      'blockedWebSockets',
    ].map((key) => [key, safeCount(result.initialSafety?.[key])]),
  );
  const mapResults = Array.isArray(result.safety?.mapResults)
    ? result.safety.mapResults
        .filter(
          (item) =>
            item &&
            ['sdk_script', 'other_map_resource'].includes(item.kind) &&
            ['http', 'dns', 'tls', 'timeout', 'policy_blocked', 'unknown'].includes(item.outcome),
        )
        .slice(0, 30)
        .map((item) => ({
          kind: item.kind,
          outcome: item.outcome,
          status:
            Number.isInteger(item.status) && item.status >= 100 && item.status <= 599
              ? item.status
              : null,
          count: safeCount(item.count),
        }))
    : [];
  return {
    schemaVersion: 1,
    scope: 'local_smoke_not_ab_test',
    interactionPolicy: ['modal-aware-v1', 'modal-focus-v2', 'modal-focus-v3'].includes(
      result.interactionPolicy,
    )
      ? result.interactionPolicy
      : 'unavailable',
    contextPolicy:
      result.contextPolicy === 'latest-screen-v1' ? result.contextPolicy : 'unavailable',
    source,
    scenario: result.scenario,
    startedAt: safeTimestamp(result.startedAt),
    goal:
      options?.scenario?.id === result.scenario &&
      (result.scenario === 'local-one-hour-parking'
        ? oneHourGoals.has(options.scenario.goal)
        : options.scenario.goal === (result.scenario === 'local-open-search' ? goal : parkingGoal))
        ? options.scenario.goal
        : null,
    persona: result.persona,
    screenVersion: 'local_current_unversioned',
    model: result.model === 'qwen3.5:9b' ? result.model : null,
    modelInfo: {
      digest:
        typeof info.digest === 'string' && /^[a-f0-9]{64}$/i.test(info.digest)
          ? info.digest.toLowerCase()
          : null,
      runner: safeInfo(info.runner, ['mlx', 'llama.cpp', 'cpu', 'cuda']),
      quantization: safeInfo(info.quantization, ['nvfp4', 'Q4', 'Q4_K_M', 'Q8_0', 'F16']),
    },
    limits: {
      maxActions: safeCount(result.limits?.maxActions),
      maxConsecutiveErrors: safeCount(result.limits?.maxConsecutiveErrors),
      actionTimeoutMs: safeCount(result.limits?.actionTimeoutMs),
      totalTimeoutMs: safeCount(result.limits?.totalTimeoutMs),
    },
    modelOptions: safeOptions(
      options ?? { modelOptions: result.modelSettings, think: result.modelSettings?.think },
    ),
    elapsedMs: safeCount(common.elapsedMs),
    modelRequests: safeCount(result.modelRequests),
    modelResponses: safeCount(result.modelResponses),
    modelCalls: Array.isArray(result.modelCalls)
      ? result.modelCalls.slice(0, 200).map((call) => ({
          request: safeCount(call.request),
          inputTokens: safeCount(call.inputTokens),
          outputTokens: safeCount(call.outputTokens),
          doneReason: ['stop', 'length', 'load', 'unload'].includes(call.doneReason)
            ? call.doneReason
            : 'unavailable',
          responseKind: ['tool', 'tool_and_text', 'text', 'empty'].includes(call.responseKind)
            ? call.responseKind
            : 'unavailable',
          elapsedMs: safeCount(call.elapsedMs),
          screenChars: safeCount(call.screenChars),
          screenFitsContext: 'unverified',
          contextObservation: ['reported_over_limit', 'reported_within_limit'].includes(
            call.contextObservation,
          )
            ? call.contextObservation
            : 'unavailable',
        }))
      : [],
    recoverableErrors: safeCount(result.recoverableErrors),
    recoveryAttempts: safeCount(result.recoveryAttempts),
    recoveredActions: safeCount(result.recoveredActions),
    termination: terminations.has(common.termination) ? common.termination : 'unavailable',
    actions,
    initialScreenEvidence: result.initialScreenEvidence
      ? {
          surveyModal: nullableBoolean(result.initialScreenEvidence.surveyModal),
          surveyClose: nullableBoolean(result.initialScreenEvidence.surveyClose),
          surveyFrame: nullableBoolean(result.initialScreenEvidence.surveyFrame),
          surveyFrameContent: ['observed', 'not_observed', 'unavailable'].includes(
            result.initialScreenEvidence.surveyFrameContent,
          )
            ? result.initialScreenEvidence.surveyFrameContent
            : 'unavailable',
          refCount: safeCount(result.initialScreenEvidence.refCount),
          firstRequestContainsSnapshot: nullableBoolean(
            result.initialScreenEvidence.firstRequestContainsSnapshot,
          ),
          firstPromptTokens: safeCount(result.initialScreenEvidence.firstPromptTokens),
        }
      : null,
    decisions,
    modelClaim: common.modelClaim,
    ...commonIndependentFields({ verification, verificationReason }),
    finalState,
    parkingEvidence,
    environment,
    safety,
    initialSafety,
    mapResults,
    limitations: [
      '실제 A/B 비교나 실제 사용자 행동 결과가 아닌 로컬 스모크다.',
      '입력값과 원본 화면·네트워크 내용은 기록하지 않는다.',
      '모델의 자기 보고와 독립 판정은 별개다.',
      ...(result.scenario === 'local-one-hour-parking'
        ? [
            '1시간 연결 점검이며 2시간 과제의 성공이 아니다.',
            '목적지의 이름과 주소 단서만 확인하며 물리적 위치를 독립적으로 측량하지 않는다.',
          ]
        : []),
      '후보 비교는 최종 시점에 렌더링된 목록의 범주이며 모델이 정보를 읽거나 비교했다는 근거가 아니다.',
      ...(['local-select-parking', 'local-one-hour-parking'].includes(result.scenario)
        ? [
            '선택만으로 요금과 도보거리를 읽거나 비교했다고 판단하지 않는다.',
            '선호 일치는 신뢰할 만한 근거가 없어 판정하지 않는다.',
          ]
        : []),
      ...(source === 'imported_unverified'
        ? ['가져온 결과의 출처와 독립 검증 실행 여부는 이 보고서만으로 확인할 수 없다.']
        : []),
    ],
  };
}

const shown = (value) =>
  value === null ? '미확인' : value === true ? '예' : value === false ? '아니요' : String(value);
export function markdownLocalReport(report) {
  const rows = report.actions.map(
    (action, index) =>
      `| ${index + 1} | ${action.tool} | ${action.target} | ${action.context} | ${action.reference} | ${action.location} | ${action.state} | ${action.focus || '-'} | ${action.taskInput || '-'} | ${action.outcome} |`,
  );
  return [
    '# 실제 화면 로컬 스모크',
    '',
    '실제 A/B 비교나 실제 사용자 행동 결과가 아니다.',
    '',
    `시나리오: ${report.scenario} / 조건: ${report.persona} / 화면: ${report.screenVersion}`,
    `화면 조작 정책: ${report.interactionPolicy}`,
    '',
    `공통 목표: ${shown(report.goal)}`,
    '',
    `모델: ${shown(report.model)} / digest: ${shown(report.modelInfo.digest)} / 실행기: ${shown(report.modelInfo.runner)} / 양자화: ${shown(report.modelInfo.quantization)}`,
    '',
    `출처: ${report.source} / 문맥 방식: ${report.contextPolicy} / 전체 시간(ms): ${shown(report.elapsedMs)} / 종료: ${report.termination}`,
    '',
    `시작 시각(UTC): ${shown(report.startedAt)}`,
    '',
    `제한: 행동 ${shown(report.limits.maxActions)}회, 연속 오류 ${shown(report.limits.maxConsecutiveErrors)}회, 도구 ${shown(report.limits.actionTimeoutMs)}ms, 전체 ${shown(report.limits.totalTimeoutMs)}ms`,
    '',
    `모델 설정: temperature ${shown(report.modelOptions.temperature)}, num_ctx ${shown(report.modelOptions.num_ctx)}, num_predict ${shown(report.modelOptions.num_predict)}, think ${shown(report.modelOptions.think)}`,
    '',
    `모델 요청·응답: ${shown(report.modelRequests)} / ${shown(report.modelResponses)} / 오류·복구 시도·복구 후 성공: ${shown(report.recoverableErrors)} / ${shown(report.recoveryAttempts)} / ${shown(report.recoveredActions)}`,
    '',
    `요청별 모델 사용량: ${report.modelCalls.length ? report.modelCalls.map((c) => `${shown(c.request)}: 입력 ${shown(c.inputTokens)}, 출력 ${shown(c.outputTokens)}, 종료 ${c.doneReason}, 응답 ${c.responseKind}, 화면 글자 ${shown(c.screenChars)}, 화면 단독 적합 미확인, 요청 토큰 ${c.contextObservation}, 시간(ms) ${shown(c.elapsedMs)}`).join(' / ') : '미확인'}`,
    '',
    `환경: SDK ${shown(report.environment.mapSdkAvailable)}, dev 조회 ${shown(report.environment.backendLookupSucceeded)}, 분석 제외 ${shown(report.environment.analyticsOptOut)}`,
    '',
    `차단 횟수(초기/전체): 쓰기 ${shown(report.initialSafety.blockedWrites)}/${shown(report.safety.blockedWrites)}, 이동 ${shown(report.initialSafety.blockedNavigations)}/${shown(report.safety.blockedNavigations)}, 분석 ${shown(report.initialSafety.analyticsAttempts)}/${shown(report.safety.analyticsAttempts)}`,
    '',
    `지도 요청 결과: ${report.mapResults.length ? report.mapResults.map((entry) => `${entry.kind}/${entry.outcome}/${shown(entry.status)}: ${shown(entry.count)}`).join(', ') : '미확인'}`,
    '',
    `모델 자기 보고: ${shown(report.modelClaim)} / 독립 판정: ${report.verification} / 근거: ${report.verificationReason}`,
    '',
    `최종 상태: 설문 표시 ${shown(report.finalState.surveyDialogVisible)}, 검색 입력란 표시 ${shown(report.finalState.searchInputVisible)}, 입력란 존재 ${shown(report.finalState.searchInputPresent)}`,
    '',
    ...(['local-select-parking', 'local-one-hour-parking'].includes(report.scenario)
      ? [
          `주차 과제 근거: 시간 ${shown(report.parkingEvidence?.duration ?? null)}, 지정 목적지 일치 ${shown(report.parkingEvidence?.destinationMatch ?? null)}, 검색 목적지 선택 ${shown(report.parkingEvidence?.searchSelection ?? null)}, 주차장 선택 ${shown(report.parkingEvidence?.selectedParking ?? null)}, 길찾기 앱 선택 화면 ${shown(report.parkingEvidence?.directionsDialog ?? null)}, 선호 일치 미확인`,
          `후보 비교: ${report.parkingEvidence?.candidateComparison ? JSON.stringify(report.parkingEvidence.candidateComparison) : '비교 불가'}`,
          ...(report.scenario === 'local-one-hour-parking'
            ? [
                `목적지 이름·도로명 단서 일치: ${shown(report.parkingEvidence?.destinationNameMatch ?? null)} / ${shown(report.parkingEvidence?.destinationAddressMatch ?? null)} / 이름 범주: ${report.parkingEvidence?.destinationNameKind ?? 'unavailable'}`,
              ]
            : []),
          '',
        ]
      : []),
    `초기 스냅샷: 설문 ${shown(report.initialScreenEvidence?.surveyModal ?? null)}, 닫기 요소 ${shown(report.initialScreenEvidence?.surveyClose ?? null)}, 설문 프레임 ${shown(report.initialScreenEvidence?.surveyFrame ?? null)}, 프레임 내부 요소 ${shown(report.initialScreenEvidence?.surveyFrameContent ?? null)}, 참조 수 ${shown(report.initialScreenEvidence?.refCount ?? null)}, 첫 요청에 포함 ${shown(report.initialScreenEvidence?.firstRequestContainsSnapshot ?? null)}, 첫 응답 입력 토큰 ${shown(report.initialScreenEvidence?.firstPromptTokens ?? null)}`,
    '',
    `모델이 요청한 도구 순서: ${report.decisions.length ? report.decisions.map((decision) => decision.tool).join(' → ') : '미확인'}`,
    '',
    '| 순서 | 도구 | 대상 범주 | 화면 맥락 | 참조 | 모달 안팎 | 대상 상태 | 입력 전 클릭 | 목적지 입력 범주 | 결과 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## 제한 사항',
    '',
    ...report.limitations.map((item) => `- ${item}`),
    '',
  ].join('\n');
}

export async function saveLocalReport(report, root = path.join(directory, 'reports')) {
  const safe = createLocalReport(
    {
      ...report,
      mode: 'local',
      actionEvents: report.actions,
      safety: { ...report.safety, mapResults: report.mapResults },
    },
    {
      options: {
        scenario: { id: report.scenario, goal: report.goal },
        modelOptions: report.modelOptions,
        think: report.modelOptions?.think,
      },
      source: report.source,
    },
  );
  return saveReportFiles({
    root,
    prefix: 'local-',
    report: safe,
    markdown: markdownLocalReport(safe),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      strict: true,
      options: { input: { type: 'string' } },
    });
    if (!values.input) throw new Error('input_required');
    const raw = await readFile(values.input, 'utf8');
    if (Buffer.byteLength(raw) > 2_000_000) throw new Error('input_too_large');
    const report = createLocalReport(JSON.parse(raw));
    const output = await saveLocalReport(report);
    console.log(
      JSON.stringify({
        scope: report.scope,
        source: report.source,
        output: path.relative(directory, output),
      }),
    );
  } catch (error) {
    console.error(
      error.message?.startsWith('지원하지 않는')
        ? error.message
        : '결과 입력 또는 보고서 저장을 확인해주세요.',
    );
    process.exitCode = 1;
  }
}
