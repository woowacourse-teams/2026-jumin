import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium } from 'playwright';
import { EvaluationError, RecoverableToolError, runAgent } from './agent.mjs';
import { readSnapshot } from './mcp-snapshot.mjs';
import { fixtureAction, fixtureState } from './fixture-evidence.mjs';
import { assessPreference } from './verifier-logic.mjs';
import { Diagnostics } from './diagnostics.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

export function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export async function jsonRequest(url, options, signal) {
  const response = await fetch(url, { ...options, signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function checkModel(options, signal) {
  let tags;
  try {
    tags = await jsonRequest(`${options.ollamaOrigin}/api/tags`, {}, signal);
  } catch (error) {
    if (signal.aborted) throw error;
    throw new EvaluationError('environment_error', '로컬 Ollama 서버에 연결할 수 없습니다.');
  }
  const { models = [] } = tags;
  const selected = models.find((entry) => entry.name === options.model);
  if (!selected) {
    throw new EvaluationError('environment_error', '선택한 로컬 모델을 찾을 수 없습니다.');
  }
  const info = await jsonRequest(
    `${options.ollamaOrigin}/api/show`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: options.model }),
    },
    signal,
  );
  if (Array.isArray(info.capabilities) && !info.capabilities.includes('tools')) {
    throw new EvaluationError('environment_error', '선택한 모델이 도구 호출을 지원하지 않습니다.');
  }
  return {
    digest: typeof selected.digest === 'string' ? selected.digest : null,
    size: typeof selected.size === 'number' ? selected.size : null,
    capabilities: Array.isArray(info.capabilities) ? info.capabilities : null,
  };
}

export async function reservePort(signal) {
  const server = createNetServer();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    signal.throwIfAborted();
    return server.address().port;
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
}

export function validateVerification(result, scenario) {
  const reasons = {
    passed: ['goal_observed'],
    not_met: [
      'destination_not_searched',
      'result_screen_not_open',
      'wrong_destination',
      'not_selected',
    ],
    unavailable: ['insufficient_evidence'],
  };
  if (
    !result ||
    !['passed', 'not_met', 'unavailable'].includes(result.verification) ||
    !reasons[result.verification]?.includes(result.verificationReason) ||
    !['matched', 'mismatch', 'not_searched', 'unavailable'].includes(result.destinationStatus) ||
    ![null, '가상역'].includes(result.searchedDestination) ||
    ![null, '가람 주차장', '다온 주차장'].includes(result.selectedParking) ||
    (result.destinationStatus === 'matched') !== (result.searchedDestination === '가상역') ||
    (result.verification === 'passed' &&
      (result.destinationStatus !== 'matched' || result.searchedDestination !== '가상역')) ||
    (result.verification === 'passed' &&
      scenario === 'parking-selection' &&
      !result.selectedParking)
  )
    throw new Error('잘못된 검증 결과');
  return {
    verification: result.verification,
    verificationReason: result.verificationReason,
    destinationStatus: result.destinationStatus,
    searchedDestination: result.searchedDestination,
    selectedParking: result.selectedParking,
  };
}

export async function verifySession(endpoint, origin, scenario, signal) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [path.join(directory, 'scenario-verifier.mjs'), endpoint, origin, scenario],
    { signal },
  );
  return validateVerification(JSON.parse(stdout), scenario);
}

export class McpToolError extends Error {
  constructor(text) {
    super('MCP 도구 오류');
    this.text = text;
  }
}

// 일반 도구 실패와 세션·접근 제한을 분리해 복구 불가 상태에서는 재시도하지 않는다.
export function classifyMcpFailure(text = '', { browserClosed = false, mcpClosed = false } = {}) {
  // 요소 이름 자체에 timeout·access denied 같은 문구가 있을 수 있다.
  if (!browserClosed && !mcpClosed && /does not match any elements\./i.test(text)) return null;
  if (
    browserClosed ||
    /target page, context or browser has been closed|target closed|browser (?:has been |is )?(?:closed|disconnected)/i.test(
      text,
    )
  )
    return 'browser_disconnected';
  if (mcpClosed || /connection (?:closed|lost)|econnreset|broken pipe/i.test(text))
    return 'mcp_disconnected';
  if (
    /\b(?:not allowed|not permitted|permission denied|access denied|forbidden|blocked by)\b/i.test(
      text,
    )
  )
    return 'forbidden_access';
  if (
    /(?:^|\n)(?:error:\s*)?(?:timeouterror\b|timeout\s+\d+(?:\.\d+)?(?:ms|s)\s+exceeded|(?:request|operation|navigation|tool) timed out)/i.test(
      text,
    )
  )
    return 'tool_timeout';
  return null;
}

export async function mcpText(client, name, args, signal, onResponse) {
  const result = await client.callTool({ name, arguments: args }, undefined, { signal });
  const text = (result.content || [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');
  onResponse?.({ isError: Boolean(result.isError), text });
  if (result.isError) throw new McpToolError(text);
  return text;
}

export async function snapshotText(client, outputDirectory, signal, existingResult) {
  const response = existingResult ?? (await mcpText(client, 'browser_snapshot', {}, signal));
  return readSnapshot(response, outputDirectory, signal);
}

export async function runEvaluation(
  options,
  {
    tempRoot = os.tmpdir(),
    signal: externalSignal,
    onDecision,
    verifyPage = verifySession,
    diagnosticDir,
  } = {},
) {
  const started = performance.now();
  const diagnostic = options.diagnostics ? new Diagnostics(options, started, diagnosticDir) : null;
  let diagnosticFailed = false;
  const capture = (operation) => {
    if (!diagnostic?.approved || diagnosticFailed) return;
    try {
      operation(diagnostic);
    } catch {
      diagnosticFailed = true;
    }
  };
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new EvaluationError('timeout', '전체 실행 제한 시간을 초과했습니다.')),
    options.timeoutMs,
  );
  const signal = externalSignal
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;
  const result = {
    scenario: options.scenario.id,
    screenVersion: options.fixtureVersion || 'fixture-a',
    persona: options.persona.id,
    model: options.model,
    termination: 'environment_error',
    modelClaim: null,
    verification: 'unavailable',
    verificationReason: 'not_verified',
    destinationStatus: 'unavailable',
    searchedDestination: null,
    selectedParking: null,
    comparisonEvidence: 'not_assessed',
    actions: 0,
    rejectedToolCalls: 0,
    recoverableErrors: 0,
    recoveryAttempts: 0,
    recoveredActions: 0,
    consecutiveErrors: 0,
    decisions: [],
    ...(options.fixtureEvidence ? { actionEvidence: [] } : {}),
    cleanupErrors: [],
  };
  let phase = 'preparation';
  let server;
  let runDirectory;
  let context;
  let launchPromise;
  let client;
  let endpoint;
  let origin;
  let ready = false;
  let browserClosed = false;
  let mcpClosed = false;
  let cleaningUp = false;
  try {
    if (
      !['fixture-a', 'fixture-b'].includes(options.fixtureVersion || 'fixture-a') ||
      (options.fixtureVersion === 'fixture-b' && options.diagnostics)
    )
      throw new EvaluationError('environment_error', '가상 화면 버전을 확인해주세요.');
    let html;
    if (diagnostic) {
      html = await readFile(path.join(directory, 'scenarios/nearby-parking.html'));
      try {
        await diagnostic.authorize(html);
      } catch {
        throw new EvaluationError(
          'environment_error',
          '진단 기록은 검토된 가상 데이터에서만 사용할 수 있습니다.',
        );
      }
      signal.throwIfAborted();
    }
    const preflightStarted = performance.now();
    const modelInfo = await checkModel(options, signal);
    result.modelDigest = /^[a-f0-9]{64}$/i.test(modelInfo.digest || '') ? modelInfo.digest : null;
    capture((log) =>
      log.event('model_preflight', {
        durationMs: Math.round(performance.now() - preflightStarted),
        modelInfo,
      }),
    );
    if (!html)
      html = await readFile(
        path.join(
          directory,
          options.fixtureVersion === 'fixture-b'
            ? 'scenarios/nearby-parking-b.html'
            : 'scenarios/nearby-parking.html',
        ),
      );
    result.screenSha256 = createHash('sha256').update(html).digest('hex');
    signal.throwIfAborted();
    server = createHttpServer((request, response) => {
      if (request.method !== 'GET' || !['/', '/results'].includes(request.url)) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'",
        'cache-control': 'no-store',
      });
      response.end(html);
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    signal.throwIfAborted();
    origin = `http://127.0.0.1:${server.address().port}`;
    if (diagnostic) diagnostic.fixtureOrigin = origin;
    const fixtureUrl = `${origin}/`;
    runDirectory = await mkdtemp(path.join(tempRoot, 'jumin-ai-ux-run-'));
    if (diagnostic) diagnostic.runDirectory = runDirectory;
    signal.throwIfAborted();
    const profile = path.join(runDirectory, 'profile');
    const outputDirectory = path.join(runDirectory, 'mcp-output');
    await mkdir(outputDirectory);
    signal.throwIfAborted();
    const port = await reservePort(signal);
    endpoint = `http://127.0.0.1:${port}`;
    const remaining = Math.max(1, options.timeoutMs - (performance.now() - started));
    launchPromise = chromium.launchPersistentContext(profile, {
      headless: true,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      timeout: Math.min(30_000, remaining),
      viewport: { width: 390, height: 844 },
      args: ['--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`],
    });
    context = await abortable(launchPromise, signal);
    context.on('close', () => {
      browserClosed = true;
      if (!cleaningUp)
        controller.abort(
          new EvaluationError('browser_disconnected', '브라우저 연결이 종료됐습니다.'),
        );
    });
    const mcpCli = path.join(
      path.dirname(require.resolve('@playwright/mcp/package.json')),
      'cli.js',
    );
    client = new Client({ name: 'jumin-ai-ux-runner', version: '0.2.0' });
    client.onclose = () => {
      mcpClosed = true;
      if (!cleaningUp)
        controller.abort(new EvaluationError('mcp_disconnected', 'MCP 연결이 종료됐습니다.'));
    };
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        mcpCli,
        `--cdp-endpoint=${endpoint}`,
        `--allowed-origins=${origin}`,
        `--output-dir=${outputDirectory}`,
        '--file-paths=absolute',
        '--timeout-action=2000',
      ],
      stderr: 'pipe',
    });
    transport.stderr?.resume();
    await client.connect(transport, { signal });
    const available = (await client.listTools(undefined, { signal })).tools;
    await mcpText(client, 'browser_navigate', { url: fixtureUrl }, signal);
    const initialSnapshot = await snapshotText(client, outputDirectory, signal);
    let evidenceSnapshot = initialSnapshot;
    capture((log) => log.event('initial_snapshot', { snapshot: initialSnapshot }));
    let initial;
    const initialVerificationStarted = performance.now();
    try {
      initial = validateVerification(
        await verifyPage(endpoint, origin, options.scenario.verification, signal),
        options.scenario.verification,
      );
      capture((log) =>
        log.event('independent_verification', {
          stage: 'initial',
          durationMs: Math.round(performance.now() - initialVerificationStarted),
          result: initial,
        }),
      );
    } catch (error) {
      if (signal.aborted) throw error;
      result.verificationReason = 'verifier_error';
      result.verificationError = '초기 독립 검증을 완료하지 못했습니다.';
      throw new EvaluationError('environment_error', '초기 화면을 검증하지 못했습니다.');
    }
    if (
      initial.verification !== 'not_met' ||
      initial.verificationReason !== 'destination_not_searched'
    ) {
      result.verificationReason =
        initial.verification === 'unavailable'
          ? initial.verificationReason
          : 'invalid_initial_state';
      throw new EvaluationError('environment_error', '초기 화면을 검증하지 못했습니다.');
    }
    ready = true;
    capture((log) =>
      log.event('setup_completed', { durationMs: Math.round(performance.now() - started) }),
    );
    phase = 'agent';
    const agentResult = await runAgent({
      scenario: options.scenario,
      persona: options.persona,
      fixtureUrl,
      initialSnapshot,
      maxActions: options.maxActions,
      maxConsecutiveErrors: options.maxConsecutiveErrors,
      available,
      decisions: result.decisions,
      onDecision,
      onToolDisposition: (event) => capture((log) => log.event('tool_disposition', event)),
      onRecovery: (event) => capture((log) => log.event('tool_recovery', event)),
      stats: result,
      signal,
      chat: async (messages, tools, requestSignal, turn) => {
        const modelStarted = performance.now();
        capture((log) => log.modelRequest(turn, messages, tools));
        try {
          const response = await jsonRequest(
            `${options.ollamaOrigin}/api/chat`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                model: options.model,
                messages,
                tools,
                stream: false,
                think: options.think,
                options: options.modelOptions,
              }),
            },
            requestSignal,
          );
          capture((log) =>
            log.modelResponse(turn, response, Math.round(performance.now() - modelStarted)),
          );
          if (!response.message || typeof response.message !== 'object') {
            throw new EvaluationError('model_error', '로컬 모델 응답 형식이 잘못됐습니다.');
          }
          if (response.done_reason === 'length') {
            throw new EvaluationError('model_error', '모델 출력이 길이 제한에 도달했습니다.');
          }
          return response.message;
        } catch (error) {
          capture((log) =>
            log.event('model_request_error', {
              turn,
              durationMs: Math.round(performance.now() - modelStarted),
              reason: requestSignal.aborted
                ? 'aborted'
                : error instanceof EvaluationError
                  ? error.reason
                  : 'request_error',
            }),
          );
          if (requestSignal.aborted) throw error;
          if (error instanceof EvaluationError) throw error;
          throw new EvaluationError('model_error', '로컬 모델 응답을 받지 못했습니다.');
        }
      },
      callTool: async (name, args, requestSignal, turn) => {
        const toolStarted = performance.now();
        let response;
        const evidence = options.fixtureEvidence
          ? fixtureAction(name, args, evidenceSnapshot, turn)
          : null;
        if (evidence) result.actionEvidence.push(evidence);
        capture((log) =>
          log.event('tool_started', {
            turn,
            callIndex: 0,
            name,
            arguments: log.safeArgs(args),
            execution: 'attempted',
          }),
        );
        try {
          if (browserClosed)
            throw new EvaluationError('browser_disconnected', '브라우저 연결이 종료됐습니다.');
          if (mcpClosed) throw new EvaluationError('mcp_disconnected', 'MCP 연결이 종료됐습니다.');
          const toolResult = await mcpText(client, name, args, requestSignal, (observed) => {
            response = observed;
          });
          if (evidence) evidence.outcome = 'mcp_success_snapshot_unavailable';
          const mcpDurationMs = Math.round(performance.now() - toolStarted);
          const snapshot = await snapshotText(
            client,
            outputDirectory,
            requestSignal,
            name === 'browser_snapshot' ? toolResult : undefined,
          );
          const delivered = `${name} 실행 성공. 현재 화면:\n${snapshot}`;
          if (evidence) {
            evidence.outcome = 'success';
            evidence.after = fixtureState(snapshot);
            evidenceSnapshot = snapshot;
          }
          capture((log) =>
            log.event('tool_completed', {
              turn,
              callIndex: 0,
              name,
              execution: 'mcp_called',
              isError: false,
              mcpDurationMs,
              durationMs: Math.round(performance.now() - toolStarted),
              mcpResult: toolResult,
              deliveredResult: delivered,
            }),
          );
          return delivered;
        } catch (error) {
          if (evidence) evidenceSnapshot = null;
          if (requestSignal.aborted) {
            if (evidence && evidence.outcome === 'unavailable') evidence.outcome = 'aborted';
            capture((log) =>
              log.event('tool_failed', {
                turn,
                callIndex: 0,
                name,
                execution: response ? 'mcp_called' : 'attempted',
                isError: response?.isError ?? null,
                mcpResult: response?.text ?? null,
                durationMs: Math.round(performance.now() - toolStarted),
                reason: 'aborted',
              }),
            );
            throw error;
          }
          const classified =
            error instanceof EvaluationError &&
            ['browser_disconnected', 'mcp_disconnected'].includes(error.reason)
              ? error.reason
              : classifyMcpFailure(
                  `${response?.text || ''}\n${error?.text || error?.message || ''}`,
                  {
                    browserClosed,
                    mcpClosed,
                  },
                );
          let reason =
            classified ||
            (response?.isError && error instanceof McpToolError
              ? 'mcp_error'
              : response
                ? 'snapshot_error'
                : 'transport_error');
          let feedback;
          if (reason === 'mcp_error') {
            try {
              const snapshot = await snapshotText(client, outputDirectory, requestSignal);
              if (evidence) {
                evidence.after = fixtureState(snapshot);
                evidenceSnapshot = snapshot;
              }
              feedback = `${name} 실행 실패:\n${response.text.slice(0, 4000)}\n\n현재 화면:\n${snapshot}`;
            } catch (snapshotError) {
              if (requestSignal.aborted) {
                capture((log) =>
                  log.event('tool_failed', {
                    turn,
                    callIndex: 0,
                    name,
                    execution: 'mcp_called',
                    isError: true,
                    mcpResult: response.text,
                    durationMs: Math.round(performance.now() - toolStarted),
                    reason: 'aborted',
                  }),
                );
                throw snapshotError;
              }
              reason =
                classifyMcpFailure(snapshotError?.text || snapshotError?.message || '', {
                  browserClosed,
                  mcpClosed,
                }) || 'snapshot_error';
            }
          }
          if (evidence && evidence.outcome === 'unavailable') evidence.outcome = reason;
          capture((log) =>
            log.event('tool_failed', {
              turn,
              callIndex: 0,
              name,
              execution: response ? 'mcp_called' : 'attempted',
              isError: response?.isError ?? null,
              mcpResult: response?.text ?? null,
              durationMs: Math.round(performance.now() - toolStarted),
              reason,
            }),
          );
          if (feedback) throw new RecoverableToolError(feedback);
          const messages = {
            browser_disconnected: '브라우저 연결이 종료됐습니다.',
            mcp_disconnected: 'MCP 연결이 종료됐습니다.',
            forbidden_access: '허용되지 않은 접근이 거부됐습니다.',
            tool_timeout: 'MCP 도구 실행 시간이 초과됐습니다.',
            snapshot_error: '오류 후 현재 화면을 확인하지 못했습니다.',
            transport_error: 'MCP 통신에 실패했습니다.',
          };
          throw new EvaluationError(reason, messages[reason] || 'MCP 도구 실행에 실패했습니다.');
        }
      },
    });
    Object.assign(result, agentResult);
  } catch (error) {
    const reason = signal.aborted ? signal.reason : error;
    result.termination =
      reason?.reason || (phase === 'agent' ? 'model_error' : 'environment_error');
    result.error =
      reason instanceof EvaluationError
        ? reason.message
        : phase === 'agent'
          ? '모델 실행을 완료하지 못했습니다.'
          : '실행 환경을 준비하지 못했습니다.';
  } finally {
    if (ready && !signal.aborted) {
      const verificationStarted = performance.now();
      try {
        const verified = validateVerification(
          await verifyPage(endpoint, origin, options.scenario.verification, signal),
          options.scenario.verification,
        );
        capture((log) =>
          log.event('independent_verification', {
            stage: 'final',
            durationMs: Math.round(performance.now() - verificationStarted),
            result: verified,
          }),
        );
        Object.assign(result, verified);
      } catch {
        capture((log) =>
          log.event('independent_verification', {
            stage: 'final',
            durationMs: Math.round(performance.now() - verificationStarted),
            error: signal.aborted ? 'aborted' : 'verifier_error',
          }),
        );
        if (signal.aborted) {
          result.termination = signal.reason?.reason || 'interrupted';
          result.error = signal.reason?.message || '실행이 중단되었습니다.';
          result.verificationReason = result.termination;
        } else {
          result.verificationReason = 'verifier_error';
          result.verificationError = '독립 검증을 완료하지 못했습니다.';
        }
      }
    }
    if (signal.aborted && result.termination !== 'timeout') {
      result.termination = signal.reason?.reason || 'interrupted';
      result.error = signal.reason?.message || '실행이 중단되었습니다.';
    }
    if (signal.aborted && result.verification === 'unavailable') {
      result.verificationReason = result.termination;
    }
    clearTimeout(timeout);
    cleaningUp = true;
    if (client) {
      try {
        await client.close();
      } catch {
        result.cleanupErrors.push('mcp');
      }
    }
    if (!context && launchPromise) {
      try {
        context = await launchPromise;
      } catch {
        /* 실행되지 않은 브라우저는 닫을 필요가 없다. */
      }
    }
    if (context) {
      try {
        await context.close();
      } catch {
        result.cleanupErrors.push('browser');
      }
    }
    if (server) {
      try {
        server.closeAllConnections();
        await new Promise((resolve, reject) =>
          server.close((error) => {
            if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
            else resolve();
          }),
        );
      } catch {
        result.cleanupErrors.push('server');
      }
    }
    if (runDirectory) {
      try {
        await rm(runDirectory, { recursive: true, force: true });
      } catch {
        result.cleanupErrors.push('profile');
      }
    }
    result.preference = assessPreference(options.scenario, options.persona, result);
    result.elapsedMs = Math.round(performance.now() - started);
    if (diagnostic) {
      if (!diagnostic.approved) {
        result.diagnostics = { status: 'refused' };
      } else if (diagnosticFailed) {
        result.diagnostics = { status: 'failed', error: '진단 기록을 수집하지 못했습니다.' };
      } else {
        try {
          const saved = await diagnostic.save(result);
          result.diagnostics = { status: saved.status, file: path.relative(directory, saved.file) };
        } catch {
          result.diagnostics = { status: 'failed', error: '진단 기록을 저장하지 못했습니다.' };
        }
      }
    }
  }
  return result;
}
