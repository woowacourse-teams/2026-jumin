const environmental = new Set([
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
  'browser_disconnected',
  'mcp_disconnected',
  'transport_error',
]);
const modelErrors = new Set(['model_error', 'model_output_limit', 'model_stopped']);
const executionErrors = new Set([
  'timeout',
  'interrupted',
  'tool_timeout',
  'snapshot_error',
  'forbidden_access',
  'forbidden_tool',
  'tool_error',
  'consecutive_error_limit',
]);
export function classifyAbRun(run) {
  if (!run) return 'not_run';
  const result = run.result || {};
  if (result.termination === 'feature_unavailable') return 'feature_unavailable';
  if (environmental.has(result.termination)) return 'environment_error';
  if (modelErrors.has(result.termination)) return 'model_error';
  if (executionErrors.has(result.termination)) return 'execution_error';
  if (result.verification === 'passed') return 'task_completed';
  if (result.verification === 'not_met') return 'task_not_met';
  return 'verification_unavailable';
}
const knownSame = (a, b) =>
  a !== null &&
  a !== undefined &&
  b !== null &&
  b !== undefined &&
  JSON.stringify(a) === JSON.stringify(b);
function mapStatus(run) {
  const entries = run?.result?.mapResults;
  if (!Array.isArray(entries) || entries.length === 0) return 'unavailable';
  return entries.some(
    (x) => x.outcome !== 'http' || !Number.isInteger(x.status) || x.status < 200 || x.status >= 300,
  )
    ? 'error_observed'
    : 'no_error_observed';
}
function contextStatus(run) {
  const calls = run?.result?.modelCalls;
  if (!Array.isArray(calls) || calls.length === 0) return 'unavailable';
  if (calls.some((call) => call.contextObservation === 'reported_over_limit'))
    return 'reported_over_limit';
  return calls.every((call) => call.contextObservation === 'reported_within_limit')
    ? 'reported_within_limit'
    : 'unavailable';
}
function issues(run) {
  if (!run) return [];
  const r = run.result,
    list = [];
  if (r.verification === 'not_met') list.push('task_not_met');
  if (r.verification === 'unavailable') list.push('verification_unavailable');
  if (r.termination === 'feature_unavailable') list.push('feature_unavailable');
  if (environmental.has(r.termination)) list.push('environment_error');
  if (modelErrors.has(r.termination)) list.push('model_error');
  if (executionErrors.has(r.termination)) list.push('execution_error');
  if (Number.isSafeInteger(r.recoverableErrors) && r.recoverableErrors > 0)
    list.push('recoverable_tool_errors');
  if (mapStatus(run) === 'error_observed') list.push('map_resource_error_effect_unknown');
  if (contextStatus(run) === 'reported_over_limit')
    list.push('context_reported_over_limit_truncation_unknown');
  return list;
}
// 조건의 일치와 화면 결과를 분리하고, 단일 실행으로 우열을 산정하지 않는다.
export function analyzeAbPairs(runs, coreComparisons, backend, transactionComparisons = {}) {
  return ['baseline', 'price', 'walking'].map((persona) => {
    const a = runs.find((r) => r.version === 'A' && r.result.persona === persona);
    const b = runs.find((r) => r.version === 'B' && r.result.persona === persona);
    const ar = a?.result,
      br = b?.result;
    const valid = (r) =>
      r &&
      r.screenUnchanged === true &&
      r.versionReview?.scenarioReady === true &&
      r.versionReview?.changeReviewed === true &&
      r.versionReview?.dataSourceReviewed === true;
    const modelKnown = (r) =>
      r &&
      r.modelInfo?.digest &&
      r.modelInfo?.runner &&
      r.modelInfo?.quantization &&
      r.interactionPolicy === 'modal-focus-v3' &&
      r.contextPolicy === 'latest-screen-v1' &&
      r.goal &&
      Object.values(r.modelOptions || {}).length &&
      Object.values(r.modelOptions).every((v) => v !== null) &&
      Object.values(r.limits || {}).length &&
      Object.values(r.limits).every((v) => v !== null);
    const conditions = Boolean(
      valid(a) &&
      valid(b) &&
      modelKnown(ar) &&
      modelKnown(br) &&
      /^[a-f0-9]{64}$/.test(a.screenSha256 || '') &&
      /^[a-f0-9]{64}$/.test(b.screenSha256 || '') &&
      a.screenSha256 !== b.screenSha256 &&
      ['dev', 'origin_dev', 'local_test'].includes(backend) &&
      knownSame(ar.scenario, br.scenario) &&
      knownSame(ar.goal, br.goal) &&
      knownSame(ar.modelInfo, br.modelInfo) &&
      knownSame(ar.modelOptions, br.modelOptions) &&
      knownSame(ar.limits, br.limits),
    );
    const aStatus = classifyAbRun(a),
      bStatus = classifyAbRun(b);
    const runnable =
      conditions &&
      !['feature_unavailable', 'environment_error', 'execution_error'].includes(aStatus) &&
      !['feature_unavailable', 'environment_error', 'execution_error'].includes(bStatus);
    const behavior = runnable ? 'comparable' : a && b ? 'limited' : 'unavailable';
    const observedCore = [
      'same_query_same_response',
      'same_query_different_response',
      'different_request',
    ].includes(coreComparisons?.[persona])
      ? coreComparisons[persona]
      : 'unavailable';
    const transactionComparison = ['same_transactions', 'transaction_difference'].includes(
      transactionComparisons?.[persona],
    )
      ? transactionComparisons[persona]
      : 'unavailable';
    const destinationKnown =
      ar?.parkingEvidence?.destinationMatch === true &&
      br?.parkingEvidence?.destinationMatch === true;
    const core = conditions && destinationKnown ? observedCore : 'unavailable';
    const maps = [mapStatus(a), mapStatus(b)];
    const contexts = [contextStatus(a), contextStatus(b)];
    const independentKnown =
      ar &&
      br &&
      ['passed', 'not_met'].includes(ar.verification) &&
      ['passed', 'not_met'].includes(br.verification);
    return {
      persona,
      conditions: conditions ? 'matched' : 'unavailable',
      behaviorComparison: behavior,
      transactionComparison,
      coreParkingComparison: core,
      coreScope: 'parking_search_query_status_body_no_session_headers',
      mapResources: { A: maps[0], B: maps[1] },
      contextReports: { A: contexts[0], B: contexts[1] },
      extraLookupCounts: {
        A: a?.dataCoverage?.coverage?.other ?? null,
        B: b?.dataCoverage?.coverage?.other ?? null,
      },
      independentOutcomeComparison:
        runnable && independentKnown ? 'comparable' : a && b ? 'limited' : 'unavailable',
      interpretation:
        behavior === 'comparable' &&
        core === 'same_query_same_response' &&
        transactionComparison === 'same_transactions' &&
        independentKnown &&
        maps.every((x) => x === 'no_error_observed') &&
        contexts.every((x) => x === 'reported_within_limit')
          ? 'within_observed_scope'
          : a && b
            ? 'limited'
            : 'unavailable',
      runs: {
        A: { status: aStatus, issues: issues(a) },
        B: { status: bStatus, issues: issues(b) },
      },
    };
  });
}
