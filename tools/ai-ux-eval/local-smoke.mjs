import { spawn, execFile } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium } from 'playwright';
import { EvaluationError, RecoverableToolError, runAgent } from './agent.mjs';
import {
  abortable,
  classifyMcpFailure,
  jsonRequest,
  mcpText,
  McpToolError,
  reservePort,
} from './evaluation.mjs';
import { inspectLocalEnvironment } from './local-environment.mjs';
import { readSnapshot } from './mcp-snapshot.mjs';
import {
  findAppFrame,
  findBlockingModal,
  inputTargetSignature,
  modalTargetScope,
} from './local-modal.mjs';
import {
  installLocalSafety,
  localBrowserOptions,
  redactLocalText,
  safeDevEnvironment,
  startSandboxWrapper,
} from './local-safety.mjs';
import { probeLocalSafety } from './local-safety-probe.mjs';
import { classifyParkingEvidence } from './local-parking-logic.mjs';
import { compactLocalMessages } from './local-context.mjs';
import { createDataFingerprint } from './local-data-fingerprint.mjs';
import { summarizeInitialScreen, summarizeActionReference } from './local-screen-evidence.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(directory, '../../client');
const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
export const LOCAL_ACTION_TIMEOUT_MS = 5000;

// 접근성 스냅샷의 유일한 참조만 고정 범주로 남긴다. 원문은 반환하지 않는다.
export function classifyLocalClickTarget(snapshot, target) {
  if (
    typeof snapshot !== 'string' ||
    typeof target !== 'string' ||
    !/^[a-zA-Z0-9_-]+$/.test(target)
  )
    return 'unavailable';
  const lines = snapshot
    .split('\n')
    .flatMap((line) =>
      [...line.matchAll(/\[ref=([a-zA-Z0-9_-]+)\]/g)]
        .filter((match) => match[1] === target)
        .map(() => line),
    );
  if (lines.length !== 1) return 'unavailable';
  if (/^\s*-\s*button "서비스 이용 경험 설문 닫기"(?:\s|$)/.test(lines[0])) return 'survey_close';
  if (/^\s*-\s*button "3일간 보지 않기"(?:\s|$)/.test(lines[0])) return 'survey_hide_three_days';
  if (/^\s*-\s*textbox "목적지 검색"(?:\s|$)/.test(lines[0])) return 'search_input';
  if (
    /^\s*-\s*button "[^"\n]+ 길찾기"(?:\s|$)/.test(lines[0]) ||
    /^\s*-\s*button "길찾기 시작"(?:\s|$)/.test(lines[0])
  )
    return 'parking_directions';
  if (/^\s*-\s*button "[^"\n]+ 상세정보"(?:\s|$)/.test(lines[0])) return 'parking_detail';
  if (/^\s*-\s*button(?:\s|$)/.test(lines[0])) return 'other_button';
  if (/^\s*-\s*(?:textbox|searchbox)(?:\s|$)/.test(lines[0])) return 'other_input';
  if (/^\s*-\s*link(?:\s|$)/.test(lines[0])) return 'other_link';
  return 'unavailable';
}

// 현재 스냅샷에 명시된 모달만 분류하며 화면 원문과 참조는 남기지 않는다.
export function classifyLocalActionContext(snapshot) {
  if (typeof snapshot !== 'string') return 'unavailable';
  const survey = (snapshot.match(/- dialog "서비스 이용 경험 설문"/g) || []).length;
  const directions = (snapshot.match(/- dialog "어떤 앱으로 갈까요\?"/g) || []).length;
  if (survey === 1 && directions === 0) return 'survey_modal';
  if (directions === 1 && survey === 0) return 'directions_modal';
  return 'unavailable';
}

export function isConfirmedClickTimeout(name, stage, error) {
  if (name !== 'browser_click' || stage !== 'action' || !(error instanceof McpToolError))
    return false;
  if (
    /\b(?:click action done|click action completed|waiting for scheduled navigations|navigations have finished)\b/i.test(
      error.text,
    )
  )
    return false;
  return (
    /\b(?:locator|page)\.click:\s*Timeout\s+\d+(?:\.\d+)?(?:ms|s)\s+exceeded\b/i.test(error.text) ||
    (/^TimeoutError:\s*browserBackend\.callTool:\s*Timeout\s+\d+(?:\.\d+)?(?:ms|s)\s+exceeded\b/im.test(
      error.text,
    ) &&
      /^\s*-\s*attempting click action\b/im.test(error.text))
  );
}

// 실제 화면의 MCP 자동 스냅샷과 콘솔 로그가 디스크에 기록되지 않도록 한다.
export async function createReadOnlyMcpDirectory(outputDirectory) {
  await mkdir(outputDirectory, { mode: 0o500 });
  try {
    await access(outputDirectory, fsConstants.W_OK);
  } catch (error) {
    if (['EACCES', 'EPERM'].includes(error.code)) return;
    throw error;
  }
  throw new EvaluationError(
    'environment_error',
    'MCP 출력 디렉터리를 쓰기 금지로 설정하지 못했습니다.',
  );
}

export function localMcpArguments(cli, endpoint, outputDirectory) {
  return [
    cli,
    `--cdp-endpoint=${endpoint}`,
    `--output-dir=${outputDirectory}`,
    '--file-paths=absolute',
    `--timeout-action=${LOCAL_ACTION_TIMEOUT_MS}`,
    '--snapshot-mode=none',
    '--codegen=none',
    '--no-webmcp',
    '--image-responses=omit',
    '--redact-url-params=ncpKeyId',
  ];
}

export async function readLocalSnapshot(client, outputDirectory, signal, existingResult) {
  const response = existingResult ?? (await mcpText(client, 'browser_snapshot', {}, signal));
  if (/\[Snapshot\]\(/.test(response))
    throw new EvaluationError('snapshot_error', '파일 스냅샷은 로컬 화면에서 사용할 수 없습니다.');
  return readSnapshot(response, outputDirectory, signal);
}

function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function assertFreePort(port) {
  const server = createNetServer();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
}

async function ownedListener(port, processGroup) {
  try {
    const { stdout } = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
    const ids = [...new Set(stdout.trim().split(/\s+/).filter(Boolean))];
    if (ids.length !== 1 || !/^\d+$/.test(ids[0])) return false;
    const group = await execFileAsync('ps', ['-p', ids[0], '-o', 'pgid=']);
    return Number(group.stdout.trim()) === processGroup;
  } catch (error) {
    if (error.code === 1 && !error.stdout && !error.stderr) return null;
    throw new EvaluationError('frontend_error', '프런트 서버 소유 프로세스를 확인하지 못했습니다.');
  }
}

export async function waitForFrontend(origin, port, processGroup, signal, childExited) {
  while (!signal.aborted) {
    if (childExited())
      throw new EvaluationError('frontend_error', '로컬 프런트 서버가 시작되지 않았습니다.');
    const owned = await ownedListener(port, processGroup);
    if (owned === false)
      throw new EvaluationError(
        'frontend_port_in_use',
        '다른 프로세스가 프런트 포트를 사용합니다.',
      );
    if (owned === null) {
      await pause(300, signal);
      continue;
    }
    try {
      const response = await fetch(`${origin}/`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(1_000)]),
        redirect: 'manual',
      });
      await response.body?.cancel();
      if (response.ok) return;
    } catch {
      if (signal.aborted) throw signal.reason;
    }
    await pause(300, signal);
  }
}

export async function stopOwnedFrontend(child, port) {
  if (!child?.pid) return;
  try {
    if (process.platform === 'win32') child.kill('SIGTERM');
    else process.kill(-child.pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if ((await ownedListener(port, child.pid)) !== true) return;
    await pause(100, AbortSignal.timeout(1_000));
  }
  if ((await ownedListener(port, child.pid)) === true) {
    if (process.platform === 'win32') child.kill('SIGKILL');
    else process.kill(-child.pid, 'SIGKILL');
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if ((await ownedListener(port, child.pid)) !== true) return;
      await pause(100, AbortSignal.timeout(1_000));
    }
    throw new Error('작업용 프런트 프로세스를 정리하지 못했습니다.');
  }
}

export function startOwnedFrontend({ port, env, directory: workingDirectory }) {
  return spawn(
    'pnpm',
    ['dev', '--host', '127.0.0.1', '--port', String(port), '--no-open', '--no-hot'],
    {
      cwd: workingDirectory,
      env,
      detached: process.platform !== 'win32',
      stdio: 'ignore',
    },
  );
}

export async function verifyLocalSession(endpoint, wrapperOrigin, appOrigin, signal) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [path.join(directory, 'local-verifier.mjs'), endpoint, wrapperOrigin, appOrigin],
    { signal },
  );
  const value = JSON.parse(stdout);
  return validateLocalVerification(value);
}

export async function verifyLocalParkingSession(
  endpoint,
  wrapperOrigin,
  appOrigin,
  signal,
  scenario = 'local-select-parking',
) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      path.join(directory, 'local-parking-verifier.mjs'),
      endpoint,
      wrapperOrigin,
      appOrigin,
      scenario,
    ],
    { signal },
  );
  const value = JSON.parse(stdout);
  const e = value?.evidence;
  if (
    !e ||
    !['early', 'recommend', 'unavailable'].includes(e.screen) ||
    !['one_hour', 'two_hours', 'other', 'unavailable'].includes(e.duration) ||
    ![true, false, null].includes(e.searchSelection) ||
    ![true, false, null].includes(e.selectedParking) ||
    ![true, false, null].includes(e.directionsDialog) ||
    (scenario === 'local-one-hour-parking' &&
      (![true, false, null].includes(e.destinationNameMatch) ||
        ![true, false, null].includes(e.destinationAddressMatch)))
  )
    throw Error('독립 검증 응답 오류');
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
    scenario,
  );
  if (
    checked.verification !== value.verification ||
    checked.verificationReason !== value.verificationReason
  )
    throw Error('독립 검증 모순');
  return checked;
}

export function validateLocalVerification(value) {
  if (
    !value ||
    !['passed', 'not_met', 'unavailable'].includes(value.verification) ||
    !['search_screen_observed', 'home_screen_observed', 'insufficient_evidence'].includes(
      value.verificationReason,
    ) ||
    typeof value.analyticsOptOut !== 'boolean' ||
    typeof value.mapSdkAvailable !== 'boolean' ||
    ![true, false, null].includes(value.searchInputVisible) ||
    ![true, false, null].includes(value.searchInputPresent) ||
    ![true, false, null].includes(value.surveyDialogVisible) ||
    (value.verification === 'passed' &&
      (value.verificationReason !== 'search_screen_observed' ||
        value.searchInputVisible !== true)) ||
    (value.verification === 'not_met' &&
      (value.verificationReason !== 'home_screen_observed' ||
        !(
          value.searchInputVisible === true ||
          (value.searchInputPresent === true && value.surveyDialogVisible === true)
        ))) ||
    (value.verification === 'unavailable' && value.verificationReason !== 'insufficient_evidence')
  )
    throw new Error('독립 검증 응답을 확인할 수 없습니다.');
  return {
    verification: value.verification,
    verificationReason: value.verificationReason,
    analyticsOptOut: value.analyticsOptOut,
    mapSdkAvailable: value.mapSdkAvailable,
    searchInputVisible: value.searchInputVisible,
    searchInputPresent: value.searchInputPresent,
    surveyDialogVisible: value.surveyDialogVisible,
  };
}

function policyViolations(stats) {
  return (
    stats.analyticsAttempts +
    stats.blockedWrites +
    stats.blockedNavigations +
    stats.blockedRedirects +
    stats.blockedMethodOverrides +
    (stats.blockedProtocols || 0)
  );
}

function initialFatalViolations(stats) {
  return (
    stats.analyticsAttempts +
    stats.blockedRedirects +
    stats.blockedMethodOverrides +
    (stats.blockedProtocols || 0)
  );
}

export async function waitForSafeHome(
  context,
  wrapperOrigin,
  appOrigin,
  stats,
  signal,
  timeoutMs,
  environment,
) {
  const deadline = performance.now() + timeoutMs;
  let pageFound = false;
  let frameFound = false;
  let frameStateRead = false;
  let sdkAvailable = false;
  environment.appPageObserved = false;
  environment.appFrameObserved = false;
  environment.frameStateRead = false;
  while (performance.now() < deadline) {
    signal.throwIfAborted();
    if (initialFatalViolations(stats))
      throw new EvaluationError('policy_violation', '보호 정책에 의해 요청이 차단됐습니다.');
    const page = context.pages().find((item) => {
      try {
        return new URL(item.url()).origin === wrapperOrigin;
      } catch {
        return false;
      }
    });
    pageFound = Boolean(page);
    if (pageFound) environment.appPageObserved = true;
    const frame = page?.frames().find((item) => {
      try {
        return item.parentFrame() === page.mainFrame() && new URL(item.url()).origin === appOrigin;
      } catch {
        return false;
      }
    });
    frameFound = Boolean(frame);
    frameStateRead = false;
    if (frameFound) environment.appFrameObserved = true;
    if (frame) {
      try {
        const flags = await frame.evaluate(() => ({
          optOut: localStorage.getItem('analytics_opt_out') === 'true',
          sdk: typeof window.naver?.maps?.Map === 'function',
          sdkScriptElementPresent: Boolean(
            document.querySelector('script[src*="/openapi/v3/maps.js"]'),
          ),
          appRootHasContent: Boolean(document.querySelector('#root')?.childElementCount),
          documentReady: document.readyState === 'complete',
          homePath: location.pathname === '/',
        }));
        frameStateRead = true;
        environment.frameStateRead = true;
        environment.analyticsOptOut = flags.optOut;
        environment.mapSdkAvailable = flags.sdk;
        if (typeof flags.sdkScriptElementPresent === 'boolean')
          environment.sdkScriptElementPresent = flags.sdkScriptElementPresent;
        if (typeof flags.appRootHasContent === 'boolean')
          environment.appRootHasContent = flags.appRootHasContent;
        if (typeof flags.documentReady === 'boolean')
          environment.documentReady = flags.documentReady;
        if (typeof flags.homePath === 'boolean') environment.homePath = flags.homePath;
        environment.backendLookupSucceeded = stats.viewportOk > 0;
        if (!flags.optOut)
          throw new EvaluationError(
            'analytics_setup_error',
            '분석 제외 설정을 확인하지 못했습니다.',
          );
        sdkAvailable = flags.sdk;
        const inputVisible = await frame.getByRole('textbox', { name: '목적지 검색' }).isVisible();
        environment.searchInputVisible = inputVisible;
        const inputPresent = (await frame.locator('input[aria-label="목적지 검색"]').count()) === 1;
        const surveyVisible = await frame
          .getByRole('dialog', { name: '서비스 이용 경험 설문' })
          .isVisible();
        environment.searchInputPresent = inputPresent;
        environment.surveyDialogVisible = surveyVisible;
        if (flags.sdk && (inputVisible || (inputPresent && surveyVisible)) && stats.viewportOk > 0)
          return;
      } catch (error) {
        if (error instanceof EvaluationError) throw error;
      }
    }
    await pause(300, signal);
  }
  if (!pageFound)
    throw new EvaluationError('app_page_unavailable', '앱 페이지를 확인하지 못했습니다.');
  if (!frameFound)
    throw new EvaluationError('app_frame_unavailable', '앱 프레임을 확인하지 못했습니다.');
  if (!frameStateRead)
    throw new EvaluationError('frame_state_unavailable', '앱 프레임 상태를 읽지 못했습니다.');
  if (!sdkAvailable)
    throw new EvaluationError('map_sdk_error', '지도 SDK 준비를 확인하지 못했습니다.');
  if (stats.viewportFailed)
    throw new EvaluationError('backend_error', 'dev 조회 요청을 완료하지 못했습니다.');
  if (!stats.viewportOk)
    throw new EvaluationError('backend_unavailable', 'dev 조회 결과를 확인하지 못했습니다.');
  if (!environment.searchInputVisible)
    throw new EvaluationError('search_input_unavailable', '검색 입력란을 확인하지 못했습니다.');
  throw new EvaluationError('environment_error', '지도와 dev 조회 준비를 확인하지 못했습니다.');
}

async function otherModelsRunning(options, signal) {
  const running = await jsonRequest(`${options.ollamaOrigin}/api/ps`, {}, signal);
  if (!Array.isArray(running.models))
    throw new EvaluationError('environment_error', '모델 로드 상태를 확인하지 못했습니다.');
  return running.models.some((model) => model.name !== options.model);
}

export async function parkingCapabilityReady() {
  try {
    const value = JSON.parse(
      await readFile(path.join(directory, 'scenarios/local-parking-capability.json'), 'utf8'),
    );
    return value.twoHourUiVerified === true;
  } catch {
    return false;
  }
}

export async function runLocalSmoke(
  options,
  {
    signal: externalSignal,
    onDecision,
    tempRoot = os.tmpdir(),
    env = process.env,
    clientDirectory = clientDir,
    frontendLauncher = startOwnedFrontend,
    readinessTimeoutMs = 20_000,
    capabilityCheck = parkingCapabilityReady,
    dataFingerprintKey = null,
  } = {},
) {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new EvaluationError('timeout', '전체 실행 제한 시간을 초과했습니다.')),
    options.timeoutMs,
  );
  const signal = externalSignal
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;
  const result = {
    mode: 'local',
    scenario: options.scenario.id,
    persona: options.persona.id,
    interactionPolicy: 'modal-focus-v3',
    contextPolicy: 'latest-screen-v1',
    model: options.model,
    startedAt: new Date().toISOString(),
    modelSettings: {
      temperature: Number.isFinite(options.modelOptions?.temperature)
        ? options.modelOptions.temperature
        : null,
      num_ctx: Number.isSafeInteger(options.modelOptions?.num_ctx)
        ? options.modelOptions.num_ctx
        : null,
      num_predict: Number.isSafeInteger(options.modelOptions?.num_predict)
        ? options.modelOptions.num_predict
        : null,
      think: typeof options.think === 'boolean' ? options.think : null,
    },
    termination: 'environment_error',
    modelClaim: null,
    verification: 'unavailable',
    verificationReason: 'not_verified',
    actions: 0,
    rejectedToolCalls: 0,
    decisions: [],
    clickEvents: [],
    actionEvents: [],
    initialScreenEvidence: null,
    finalState: { surveyDialogVisible: null, searchInputVisible: null, searchInputPresent: null },
    ...(['local-select-parking', 'local-one-hour-parking'].includes(options.scenario.id)
      ? { parkingEvidence: null }
      : {}),
    limits: {
      actionTimeoutMs: LOCAL_ACTION_TIMEOUT_MS,
      totalTimeoutMs: options.timeoutMs,
      maxActions: options.maxActions,
      maxConsecutiveErrors: options.maxConsecutiveErrors,
    },
    modelRequests: 0,
    modelResponses: 0,
    modelCalls: [],
    cleanupErrors: [],
    environment: {},
    safety: null,
    blockedSummary: [],
  };
  let frontend;
  let frontendExited = false;
  let wrapper;
  let context;
  let launchPromise;
  let mcp;
  let runDirectory;
  let endpoint;
  let ready = false;
  let cleaningUp = false;
  let browserClosed = false;
  let mcpClosed = false;
  let safety;
  const dataFingerprint = dataFingerprintKey
    ? createDataFingerprint(dataFingerprintKey, {
        expectedDurationMs: options.scenario.id === 'local-one-hour-parking' ? 3600000 : 7200000,
      })
    : null;
  let initialPolicyCount = null;
  let appOrigin;
  let frontendPort;
  let probePromise;
  try {
    if (
      options.mode !== 'local' ||
      options.diagnostics ||
      !['local-open-search', 'local-select-parking', 'local-one-hour-parking'].includes(
        options.scenario.id,
      ) ||
      !(options.scenario.id === 'local-open-search'
        ? options.persona.id === 'baseline'
        : ['baseline', 'price', 'walking'].includes(options.persona.id)) ||
      options.model !== 'qwen3.5:9b'
    )
      throw new EvaluationError('environment_error', '로컬 스모크 설정을 확인해주세요.');
    if (options.scenario.id === 'local-select-parking' && !(await capabilityCheck()))
      throw new EvaluationError(
        'feature_unavailable',
        '2시간 주차 선택 UI가 아직 검증되지 않았습니다.',
      );
    let selectedLocal;
    try {
      selectedLocal = new URL(options.localUrl);
    } catch {
      throw new EvaluationError('environment_error', '로컬 프런트 주소를 확인해주세요.');
    }
    if (
      selectedLocal.protocol !== 'http:' ||
      !['localhost', '127.0.0.1'].includes(selectedLocal.hostname) ||
      selectedLocal.username ||
      selectedLocal.password ||
      selectedLocal.pathname !== '/' ||
      selectedLocal.search ||
      selectedLocal.hash ||
      !selectedLocal.port ||
      Number(selectedLocal.port) < 1024
    )
      throw new EvaluationError('environment_error', '로컬 프런트 주소를 확인해주세요.');
    const environment = await inspectLocalEnvironment(options, {
      env,
      clientDir: clientDirectory,
      signal,
    });
    result.environment = environment.requirements;
    if (environment.requirements.modelMetadataAvailable) {
      result.modelInfo = {
        digest: environment.modelInfo.digest,
        runner: environment.modelInfo.runner,
        quantization: environment.modelInfo.quantization,
      };
      try {
        const previous = JSON.parse(
          await readFile(
            path.join(directory, 'diagnostics/qwen-model-comparison-2026-11-09.json'),
            'utf8',
          ),
        );
        const old = previous.runs?.find((run) => run.model === options.model)?.digest;
        result.modelInfo.matchesPreviousDigest =
          typeof old === 'string' ? old === result.modelInfo.digest : null;
        const details = previous.qwen35Metadata?.details;
        result.modelInfo.matchesPreviousRunner =
          typeof details?.runner === 'string' ? details.runner === result.modelInfo.runner : null;
        result.modelInfo.matchesPreviousQuantization =
          typeof details?.quantization_level === 'string'
            ? details.quantization_level === result.modelInfo.quantization
            : null;
      } catch {
        result.modelInfo.matchesPreviousDigest = null;
        result.modelInfo.matchesPreviousRunner = null;
        result.modelInfo.matchesPreviousQuantization = null;
      }
    }
    if (
      !environment.requirements.mapKeyConfigured ||
      !environment.requirements.backendAllowed ||
      !environment.requirements.modelAvailable ||
      !environment.requirements.modelToolSupport ||
      !environment.requirements.modelMetadataAvailable ||
      environment.requirements.otherModelsLoaded !== false
    )
      throw new EvaluationError(
        'environment_error',
        '필수 로컬 환경이나 모델 상태가 준비되지 않았습니다.',
      );

    probePromise = probeLocalSafety({
      hostname: selectedLocal.hostname,
      upgradeInsecureRequests: true,
    });
    result.safetyProbe = await abortable(probePromise, signal);
    if (!result.safetyProbe.passed)
      throw new EvaluationError('safety_probe_failed', '로컬 보호 정책 검증에 실패했습니다.');
    const port = Number(selectedLocal.port);
    frontendPort = port;
    appOrigin = selectedLocal.origin;
    try {
      await assertFreePort(port);
    } catch {
      throw new EvaluationError('frontend_port_in_use', '로컬 프런트 포트가 이미 사용 중입니다.');
    }
    frontend = frontendLauncher({
      port,
      directory: clientDirectory,
      env: safeDevEnvironment(env, environment.backendOrigin),
    });
    frontend.once('error', () => {
      frontendExited = true;
    });
    frontend.once('exit', () => {
      frontendExited = true;
    });
    await waitForFrontend(appOrigin, port, frontend.pid, signal, () => frontendExited);
    result.environment.frontendReady = true;

    wrapper = await startSandboxWrapper(appOrigin);
    runDirectory = await mkdtemp(path.join(tempRoot, 'jumin-ai-ux-local-'));
    const outputDirectory = path.join(runDirectory, 'mcp-output');
    await createReadOnlyMcpDirectory(outputDirectory);
    const cdpPort = await reservePort(signal);
    endpoint = `http://127.0.0.1:${cdpPort}`;
    launchPromise = chromium.launchPersistentContext(path.join(runDirectory, 'profile'), {
      ...localBrowserOptions,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      timeout: Math.max(1, Math.min(30_000, options.timeoutMs - (performance.now() - started))),
      args: ['--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${cdpPort}`],
    });
    context = await abortable(launchPromise, signal);
    context.on('close', () => {
      browserClosed = true;
      if (!cleaningUp)
        controller.abort(
          new EvaluationError('browser_disconnected', '브라우저 연결이 종료됐습니다.'),
        );
    });
    safety = await installLocalSafety(
      context,
      { appOrigin, wrapperOrigin: wrapper.origin, scenario: options.scenario.id },
      (entry) => {
        const { method, category, resourceType, frame, transport, reason } = entry;
        if (category === 'dev_api')
          dataFingerprint?.fail(['GET', 'HEAD'].includes(method) ? undefined : 'blocked_non_read');
        if (category === 'map') dataFingerprint?.fail('map_resource');
        const phase = initialPolicyCount === null ? 'initial' : 'after_readiness';
        const existing = result.blockedSummary.find(
          (item) =>
            item.method === method &&
            item.category === category &&
            item.resourceType === resourceType &&
            item.frame === frame &&
            item.transport === transport &&
            item.reason === reason &&
            item.phase === phase,
        );
        if (existing) existing.count += 1;
        else
          result.blockedSummary.push({
            method,
            category,
            resourceType,
            frame,
            transport,
            reason,
            phase,
            count: 1,
          });
        if (
          initialPolicyCount !== null &&
          ['analytics', 'write', 'navigation', 'redirect', 'method_override'].includes(entry.reason)
        )
          controller.abort(
            new EvaluationError('policy_violation', '보호 정책에 의해 요청이 차단됐습니다.'),
          );
      },
      { upgradeInsecureRequests: true, dataFingerprint },
    );
    const initialPage = context.pages()[0];
    result.environment.pageErrorCount = 0;
    initialPage?.on('pageerror', () => {
      result.environment.pageErrorCount += 1;
    });
    context.on('page', (page) => {
      if (page !== initialPage) void page.close().catch(() => {});
    });
    initialPage?.on('console', (message) => {
      if (
        /navigation to external protocol blocked by sandbox|framing .*violates.*frame-src/i.test(
          message.text(),
        )
      ) {
        safety.blockedProtocols = (safety.blockedProtocols || 0) + 1;
        if (initialPolicyCount !== null)
          controller.abort(
            new EvaluationError('policy_violation', '보호 정책에 의해 요청이 차단됐습니다.'),
          );
      }
    });
    mcp = new Client({ name: 'jumin-ai-ux-local-smoke', version: '0.1.0' });
    mcp.onclose = () => {
      mcpClosed = true;
      if (!cleaningUp)
        controller.abort(new EvaluationError('mcp_disconnected', 'MCP 연결이 종료됐습니다.'));
    };
    const mcpCli = path.join(
      path.dirname(require.resolve('@playwright/mcp/package.json')),
      'cli.js',
    );
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: localMcpArguments(mcpCli, endpoint, outputDirectory),
      stderr: 'pipe',
    });
    transport.stderr?.resume();
    await mcp.connect(transport, { signal });
    const available = (await mcp.listTools(undefined, { signal })).tools;
    await mcpText(mcp, 'browser_navigate', { url: wrapper.url }, signal);
    await waitForSafeHome(
      context,
      wrapper.origin,
      appOrigin,
      safety,
      signal,
      readinessTimeoutMs,
      result.environment,
    );
    const initial = await verifyLocalSession(endpoint, wrapper.origin, appOrigin, signal);
    if (
      initial.verification !== 'not_met' ||
      initial.verificationReason !== 'home_screen_observed' ||
      !initial.analyticsOptOut ||
      !initial.mapSdkAvailable
    )
      throw new EvaluationError(
        'environment_error',
        '초기 주민 화면과 분석 제외 상태를 확인하지 못했습니다.',
      );
    result.environment.mapSdkAvailable = true;
    result.environment.backendLookupSucceeded = true;
    result.environment.analyticsOptOut = true;
    result.initialSafety = {
      ...safety,
      mapResults: safety.mapResults.map((entry) => ({ ...entry })),
    };
    initialPolicyCount = policyViolations(safety);
    const initialSnapshot = redactLocalText(
      await readLocalSnapshot(mcp, outputDirectory, signal),
      environment.mapKey,
    );
    let currentSnapshot = initialSnapshot;
    result.initialScreenEvidence = summarizeInitialScreen(initialSnapshot);
    ready = true;
    const agentResult = await runAgent({
      scenario: options.scenario,
      persona: options.persona,
      fixtureUrl: wrapper.url,
      initialSnapshot,
      maxActions: options.maxActions,
      maxConsecutiveErrors: options.maxConsecutiveErrors,
      allowedNavigation: (url) => url.pathname === '/' && !url.search && !url.hash,
      localMode: true,
      available,
      decisions: result.decisions,
      stats: result,
      signal,
      onDecision,
      chat: async (messages, tools, requestSignal) => {
        if (policyViolations(safety) > initialPolicyCount)
          throw new EvaluationError('policy_violation', '보호 정책에 의해 요청이 차단됐습니다.');
        if (await otherModelsRunning(options, requestSignal))
          throw new EvaluationError('model_conflict', '다른 모델이 로드되어 실행을 중단했습니다.');
        const selectedMessages = compactLocalMessages(
          messages,
          currentSnapshot,
          result.actionEvents,
          result.decisions,
        );
        if (result.modelRequests === 0 && result.initialScreenEvidence) {
          result.initialScreenEvidence.firstRequestContainsSnapshot = selectedMessages.some(
            (message) =>
              message.role === 'user' &&
              typeof message.content === 'string' &&
              message.content.includes(initialSnapshot),
          );
        }
        result.modelRequests += 1;
        const modelCall = {
          request: result.modelRequests,
          inputTokens: null,
          outputTokens: null,
          doneReason: 'unavailable',
          responseKind: 'unavailable',
          elapsedMs: null,
        };
        result.modelCalls.push(modelCall);
        const modelCallStart = performance.now();
        try {
          const response = await jsonRequest(
            `${options.ollamaOrigin}/api/chat`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                model: options.model,
                messages: selectedMessages,
                tools,
                stream: false,
                think: options.think,
                options: options.modelOptions,
              }),
            },
            requestSignal,
          );
          result.modelResponses += 1;
          modelCall.inputTokens =
            Number.isSafeInteger(response.prompt_eval_count) && response.prompt_eval_count >= 0
              ? response.prompt_eval_count
              : null;
          modelCall.outputTokens =
            Number.isSafeInteger(response.eval_count) && response.eval_count >= 0
              ? response.eval_count
              : null;
          modelCall.screenChars =
            typeof currentSnapshot === 'string' ? currentSnapshot.length : null;
          modelCall.contextObservation =
            modelCall.inputTokens === null
              ? 'unavailable'
              : modelCall.inputTokens > options.modelOptions.num_ctx
                ? 'reported_over_limit'
                : 'reported_within_limit';
          modelCall.doneReason = ['stop', 'length', 'load', 'unload'].includes(response.done_reason)
            ? response.done_reason
            : 'unavailable';
          const hasTool =
            Array.isArray(response.message?.tool_calls) && response.message.tool_calls.length > 0;
          const hasText =
            typeof response.message?.content === 'string' && response.message.content.length > 0;
          modelCall.responseKind = hasTool
            ? hasText
              ? 'tool_and_text'
              : 'tool'
            : hasText
              ? 'text'
              : 'empty';
          modelCall.elapsedMs = Math.round(performance.now() - modelCallStart);
          if (
            result.modelResponses === 1 &&
            result.initialScreenEvidence &&
            Number.isSafeInteger(response.prompt_eval_count) &&
            response.prompt_eval_count >= 0
          )
            result.initialScreenEvidence.firstPromptTokens = response.prompt_eval_count;
          if (response.done_reason === 'length')
            throw new EvaluationError(
              'model_output_limit',
              '모델 응답이 출력 제한에 도달했습니다.',
            );
          if (!response.message)
            throw new EvaluationError('model_error', '모델 응답을 사용할 수 없습니다.');
          return response.message;
        } catch (error) {
          if (modelCall.elapsedMs === null)
            modelCall.elapsedMs = Math.round(performance.now() - modelCallStart);
          if (requestSignal.aborted || error instanceof EvaluationError) throw error;
          throw new EvaluationError('model_error', '로컬 모델 응답을 받지 못했습니다.');
        }
      },
      callTool: async (name, args, requestSignal) => {
        if (policyViolations(safety) > initialPolicyCount)
          throw new EvaluationError('policy_violation', '보호 정책에 의해 요청이 차단됐습니다.');
        const before = policyViolations(safety);
        let stage = 'action';
        const actionEvent =
          name === 'browser_click' || name === 'browser_type'
            ? {
                tool: name,
                target: classifyLocalClickTarget(currentSnapshot, args.target),
                context: classifyLocalActionContext(currentSnapshot),
                ...summarizeActionReference(currentSnapshot, args.target),
                outcome: 'unavailable',
              }
            : null;
        if (actionEvent) result.actionEvents.push(actionEvent);
        const clickEvent = name === 'browser_click' ? actionEvent : null;
        if (clickEvent) result.clickEvents.push(clickEvent);
        if (actionEvent) {
          const modal = await findBlockingModal(context, wrapper.origin, appOrigin);
          if (modalTargetScope(currentSnapshot, modal, args.target) === 'outside') {
            actionEvent.outcome = 'modal_blocked_feedback';
            throw new RecoverableToolError(
              `열린 대화상자 때문에 해당 요소는 현재 조작할 수 없습니다. 화면을 확인하고 다음 행동을 선택하세요.\n\n현재 화면:\n${currentSnapshot}`,
            );
          }
        }
        try {
          if (browserClosed || mcpClosed)
            throw new EvaluationError(
              browserClosed ? 'browser_disconnected' : 'mcp_disconnected',
              '브라우저 또는 MCP 연결이 종료됐습니다.',
            );
          // 실제 사용자의 입력처럼 먼저 포커스한다. 클릭으로 화면이 바뀌면
          // 이전 참조에 값을 채우지 않고 모델이 새 화면에서 다시 판단한다.
          const signature =
            name === 'browser_type' && inputTargetSignature(currentSnapshot, args.target);
          if (signature) {
            const beforeUrl = findAppFrame(context, wrapper.origin, appOrigin)?.url();
            stage = 'focus';
            await mcpText(mcp, 'browser_click', { target: args.target }, requestSignal);
            actionEvent.focus = 'clicked';
            stage = 'snapshot';
            const afterSnapshot = redactLocalText(
              await readLocalSnapshot(mcp, outputDirectory, requestSignal),
              environment.mapKey,
            );
            if (policyViolations(safety) > before)
              throw new EvaluationError(
                'policy_violation',
                '보호 정책에 의해 요청이 차단됐습니다.',
              );
            const afterUrl = findAppFrame(context, wrapper.origin, appOrigin)?.url();
            const activeModal = await findBlockingModal(context, wrapper.origin, appOrigin);
            currentSnapshot = afterSnapshot;
            if (
              !beforeUrl ||
              !afterUrl ||
              beforeUrl !== afterUrl ||
              inputTargetSignature(afterSnapshot, args.target) !== signature ||
              modalTargetScope(afterSnapshot, activeModal, args.target) === 'outside'
            ) {
              actionEvent.outcome = 'focus_transition';
              return `입력란을 클릭하는 동안 화면이 바뀌어 텍스트는 아직 입력하지 않았습니다. 현재 화면을 확인하고 다음 행동을 선택하세요.\n\n현재 화면:\n${currentSnapshot}`;
            }
          }
          stage = 'action';
          const toolResult = await mcpText(mcp, name, args, requestSignal);
          if (actionEvent) actionEvent.outcome = 'success';
          if (
            name === 'browser_type' &&
            options.scenario.id === 'local-one-hour-parking' &&
            actionEvent?.target === 'search_input'
          ) {
            const input = args.text.normalize('NFKC').trim();
            actionEvent.taskInput =
              input === '서울역' ? 'exact' : input.includes('서울역') ? 'contains' : 'different';
          }
          stage = 'snapshot';
          const snapshot = await readLocalSnapshot(
            mcp,
            outputDirectory,
            requestSignal,
            name === 'browser_snapshot' ? toolResult : undefined,
          );
          const after = policyViolations(safety);
          if (after > before)
            throw new EvaluationError('policy_violation', '보호 정책에 의해 요청이 차단됐습니다.');
          currentSnapshot = redactLocalText(snapshot, environment.mapKey);
          return `${name} 실행 성공. 현재 화면:\n${currentSnapshot}`;
        } catch (error) {
          currentSnapshot = null;
          if (requestSignal.aborted || error instanceof EvaluationError) throw error;
          const after = policyViolations(safety);
          if (after > before)
            throw new EvaluationError('policy_violation', '보호 정책에 의해 요청이 차단됐습니다.');
          const fatal = classifyMcpFailure(error?.text || error?.message || '', {
            browserClosed,
            mcpClosed,
          });
          const clickTimeout =
            fatal === 'tool_timeout' &&
            isConfirmedClickTimeout(
              stage === 'focus' ? 'browser_click' : name,
              stage === 'focus' ? 'action' : stage,
              error,
            );
          if (actionEvent && ['action', 'focus'].includes(stage))
            actionEvent.outcome = clickTimeout ? 'click_timeout' : fatal || 'mcp_error';
          if (fatal && !clickTimeout)
            throw new EvaluationError(fatal, '브라우저 도구를 계속 실행할 수 없습니다.');
          if (!(error instanceof McpToolError))
            throw new EvaluationError('transport_error', 'MCP 통신을 완료하지 못했습니다.');
          let snapshot;
          try {
            snapshot = await readLocalSnapshot(mcp, outputDirectory, requestSignal);
          } catch {
            if (requestSignal.aborted) throw requestSignal.reason;
            if (browserClosed || mcpClosed)
              throw new EvaluationError(
                browserClosed ? 'browser_disconnected' : 'mcp_disconnected',
                '브라우저 또는 MCP 연결이 종료됐습니다.',
              );
            throw new EvaluationError('snapshot_error', '현재 화면을 확인하지 못했습니다.');
          }
          if (clickTimeout) {
            let verification;
            try {
              verification = await verifyLocalSession(
                endpoint,
                wrapper.origin,
                appOrigin,
                requestSignal,
              );
            } catch {
              if (requestSignal.aborted) throw requestSignal.reason;
              if (browserClosed || mcpClosed)
                throw new EvaluationError(
                  browserClosed ? 'browser_disconnected' : 'mcp_disconnected',
                  '브라우저 또는 MCP 연결이 종료됐습니다.',
                );
              throw new EvaluationError('snapshot_error', '현재 화면을 확인하지 못했습니다.');
            }
            if (['local-select-parking', 'local-one-hour-parking'].includes(options.scenario.id)) {
              const parking = await verifyLocalParkingSession(
                endpoint,
                wrapper.origin,
                appOrigin,
                requestSignal,
                options.scenario.id,
              );
              if (parking.verification === 'unavailable')
                throw new EvaluationError(
                  'snapshot_error',
                  '현재 화면을 안전하게 확인하지 못했습니다.',
                );
              verification = { ...verification, verification: parking.verification };
            }
            if (requestSignal.aborted) throw requestSignal.reason;
            if (browserClosed || mcpClosed)
              throw new EvaluationError(
                browserClosed ? 'browser_disconnected' : 'mcp_disconnected',
                '브라우저 또는 MCP 연결이 종료됐습니다.',
              );
            if (policyViolations(safety) > before)
              throw new EvaluationError(
                'policy_violation',
                '보호 정책에 의해 요청이 차단됐습니다.',
              );
            if (
              verification.verification === 'unavailable' ||
              !verification.analyticsOptOut ||
              !snapshot.trim()
            )
              throw new EvaluationError(
                'snapshot_error',
                '현재 화면을 안전하게 확인하지 못했습니다.',
              );
            currentSnapshot = redactLocalText(snapshot, environment.mapKey);
            actionEvent.outcome = 'click_timeout_feedback';
            throw new RecoverableToolError(
              `클릭 동작 시간 초과. 현재 화면을 확인하고 다음 행동을 선택하세요.\n\n현재 화면:\n${currentSnapshot}`,
            );
          }
          currentSnapshot = redactLocalText(snapshot, environment.mapKey);
          throw new RecoverableToolError(
            `${name} 실행 실패:\n${redactLocalText(error.text.slice(0, 4000), environment.mapKey)}\n\n현재 화면:\n${currentSnapshot}`,
          );
        }
      },
    });
    Object.assign(result, agentResult);
  } catch (error) {
    const reason = signal.aborted ? signal.reason : error;
    result.termination = reason?.reason || 'environment_error';
    result.error =
      reason instanceof EvaluationError
        ? reason.message
        : '로컬 스모크 환경을 확인하지 못했습니다.';
  } finally {
    if (safety && initialPolicyCount === null)
      result.initialSafety = {
        ...safety,
        mapResults: safety.mapResults.map((entry) => ({ ...entry })),
      };
    if (ready && !signal.aborted) {
      try {
        const verified = await verifyLocalSession(endpoint, wrapper.origin, appOrigin, signal);
        if (['local-select-parking', 'local-one-hour-parking'].includes(options.scenario.id)) {
          const parking = await verifyLocalParkingSession(
            endpoint,
            wrapper.origin,
            appOrigin,
            signal,
            options.scenario.id,
          );
          // 아래 catch가 판정 불가로 처리한다. 이 예외는 finally 밖으로 나가지 않는다.
          // eslint-disable-next-line no-unsafe-finally
          if (!verified.analyticsOptOut) throw Error('분석 제외 확인 실패');
          result.verification = parking.verification;
          result.verificationReason = parking.verificationReason;
          result.parkingEvidence = parking.evidence;
          // 같은 세션의 독립 검증이 확인한 목적지와 실제 조회 좌표를 메모리에서만 연결한다.
          if (
            dataFingerprint &&
            parking.evidence.searchSelection === true &&
            (options.scenario.id !== 'local-one-hour-parking' ||
              parking.evidence.destinationMatch === true)
          ) {
            try {
              const pages = context.pages().filter((page) => {
                try {
                  return new URL(page.url()).origin === wrapper.origin;
                } catch {
                  return false;
                }
              });
              const frames =
                pages.length === 1
                  ? pages[0].frames().filter((frame) => {
                      try {
                        return (
                          frame.parentFrame() === pages[0].mainFrame() &&
                          new URL(frame.url()).origin === appOrigin
                        );
                      } catch {
                        return false;
                      }
                    })
                  : [];
              if (frames.length === 1) {
                const url = new URL(frames[0].url());
                if (
                  url.pathname === '/parkingRecommend' &&
                  url.searchParams.getAll('lat').length === 1 &&
                  url.searchParams.getAll('lng').length === 1
                )
                  dataFingerprint.bindVerifiedDestination(
                    url.searchParams.get('lat'),
                    url.searchParams.get('lng'),
                  );
              }
            } catch {
              /* 연결을 확인하지 못하면 핵심 비교는 미확인으로 남는다. */
            }
          }
        } else {
          result.verification = verified.verification;
          result.verificationReason = verified.verificationReason;
        }
        result.finalState = {
          surveyDialogVisible: verified.surveyDialogVisible,
          searchInputVisible: verified.searchInputVisible,
          searchInputPresent: verified.searchInputPresent,
        };
      } catch {
        result.verificationReason = 'verifier_error';
      }
    }
    if (signal.aborted) {
      result.termination = signal.reason?.reason || 'interrupted';
      result.error = signal.reason?.message || '실행이 중단됐습니다.';
    }
    if (
      safety &&
      (initialPolicyCount === null
        ? initialFatalViolations(safety)
        : policyViolations(safety) > initialPolicyCount) &&
      !signal.aborted
    ) {
      result.termination = 'policy_violation';
      result.error = '보호 정책에 의해 요청이 차단됐습니다.';
    }
    clearTimeout(timeout);
    cleaningUp = true;
    if (probePromise) await probePromise.catch(() => {});
    if (mcp)
      try {
        await mcp.close();
      } catch {
        result.cleanupErrors.push('mcp');
      }
    if (!context && launchPromise)
      try {
        context = await launchPromise;
      } catch {
        /* 브라우저가 시작되지 않았다. */
      }
    if (context)
      try {
        await context.close();
      } catch {
        result.cleanupErrors.push('browser');
      }
    if (wrapper?.server.listening)
      try {
        wrapper.server.closeAllConnections();
        await new Promise((resolve) => wrapper.server.close(resolve));
      } catch {
        result.cleanupErrors.push('wrapper');
      }
    if (frontend)
      try {
        await stopOwnedFrontend(frontend, frontendPort);
      } catch {
        result.cleanupErrors.push('frontend');
      }
    if (runDirectory)
      try {
        await rm(runDirectory, { recursive: true, force: true });
      } catch {
        result.cleanupErrors.push('profile');
      }
    result.safety = safety ? { ...safety } : null;
    if (dataFingerprint) result.dataFingerprint = dataFingerprint.finish();
    result.elapsedMs = Math.round(performance.now() - started);
  }
  return result;
}
