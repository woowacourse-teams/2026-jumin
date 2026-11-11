import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseOptions } from '../../options.mjs';
import { runEvaluation } from '../../evaluation.mjs';

const call = (name, args) => ({
  role: 'assistant',
  content: '저장하면 안 되는 모델 자연어 원문',
  thinking: '저장하면 안 되는 모델 내부 추론',
  tool_calls: [{ function: { name, arguments: args } }],
});

// 모델 서버만 대체하며 실제 MCP·브라우저와 진단 파일을 함께 검증한다.
async function withModel(run) {
  let script = [];
  const requests = [];
  const server = createServer(async (request, response) => {
    if (request.url === '/api/tags') {
      response.end(
        JSON.stringify({ models: [{ name: 'test-model', digest: 'synthetic-digest', size: 123 }] }),
      );
      return;
    }
    if (request.url === '/api/show') {
      response.end(JSON.stringify({ capabilities: ['completion', 'tools'] }));
      return;
    }
    if (request.url === '/api/chat') {
      let body = '';
      for await (const chunk of request) body += chunk;
      requests.push(JSON.parse(body));
      const message = script.shift();
      if (message === 'hang') return;
      if (!message) {
        response.writeHead(500).end();
        return;
      }
      response.end(
        JSON.stringify({ message, prompt_eval_count: 23, eval_count: 7, done_reason: 'stop' }),
      );
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumin-diag-integration-'));
  const diagnosticDir = path.join(root, 'diagnostics');
  const optionsFor = (enabled) =>
    parseOptions(
      [
        '--scenario',
        'select-parking',
        '--persona',
        'baseline',
        '--model',
        'test-model',
        '--ollama-url',
        `http://127.0.0.1:${server.address().port}`,
        '--max-actions',
        '12',
        '--timeout-seconds',
        '60',
        ...(enabled ? ['--diagnostics'] : []),
      ],
      {},
    );
  try {
    await run({
      requests,
      root,
      diagnosticDir,
      optionsFor,
      setScript: (actions) => {
        script = [...actions];
      },
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
}

function successfulActions() {
  return [
    call('browser_click', { element: '대상 없는 요청' }),
    call('browser_type', { target: '#destination', text: '가상역' }),
    call('browser_click', { target: 'button:has-text("주차장 검색")' }),
    call('browser_click', { target: 'button:has-text("가람 주차장 선택")' }),
    call('report_completion', { success: true }),
  ];
}

test('진단 여부가 모델 입력·행동을 바꾸지 않고 판단별 스냅샷과 결과를 기록한다', async () => {
  await withModel(async ({ requests, root, diagnosticDir, optionsFor, setScript }) => {
    // 같은 대역 스크립트를 새 세션에서 두 번 수행해 기록 기능의 행동 영향 여부를 비교한다.
    setScript(successfulActions());
    const without = await runEvaluation(optionsFor(false), { tempRoot: root, diagnosticDir });
    const firstRequests = structuredClone(requests);
    assert.equal(without.verification, 'passed');
    assert.equal(without.diagnostics, undefined);
    await assert.rejects(readdir(diagnosticDir));

    requests.length = 0;
    setScript(successfulActions());
    const withLog = await runEvaluation(optionsFor(true), { tempRoot: root, diagnosticDir });
    assert.equal(withLog.verification, 'passed');
    assert.equal(withLog.diagnostics.status, 'saved');
    assert.deepEqual(withLog.decisions, without.decisions);
    assert.equal(withLog.rejectedToolCalls, 1);
    const normalize = (value) =>
      JSON.stringify(value).replace(/http:\/\/127\.0\.0\.1:\d+/g, '[fixture-origin]');
    assert.equal(normalize(requests), normalize(firstRequests));

    // 저장된 각 판단의 스냅샷, 거부된 호출, 실제 MCP 응답 및 사용량을 확인한다.
    const [name] = await readdir(diagnosticDir);
    const raw = await readFile(path.join(diagnosticDir, name), 'utf8');
    const record = JSON.parse(raw);
    const modelRequests = record.events.filter((event) => event.type === 'model_request');
    const responses = record.events.filter((event) => event.type === 'model_response');
    assert.equal(modelRequests.length, 5);
    assert.equal(modelRequests[0].snapshots.length, 1);
    assert.ok(modelRequests[0].toolSchemas.some((tool) => tool.name === 'browser_click'));
    assert.equal(modelRequests[1].snapshots.length, 1);
    assert.match(modelRequests[2].snapshots.at(-1).text, /가상역/);
    assert.match(modelRequests[3].snapshots.at(-1).text, /가람 주차장/);
    assert.equal(responses[0].toolCalls[0].arguments.element, '대상 없는 요청');
    assert.equal(responses[1].toolCalls[0].arguments.text, '가상역');
    assert.equal(responses[0].usage.prompt_eval_count, 23);
    assert.equal(responses[0].usage.eval_count, 7);
    assert.ok(
      record.events.some(
        (event) =>
          event.type === 'tool_disposition' &&
          event.execution === 'not_executed' &&
          event.feedback?.includes('도구를 실행하지 않았습니다'),
      ),
    );
    assert.ok(
      record.events.some(
        (event) =>
          event.type === 'tool_completed' &&
          event.execution === 'mcp_called' &&
          event.mcpResult &&
          event.durationMs >= 0,
      ),
    );
    assert.ok(
      record.events.some(
        (event) =>
          event.type === 'tool_disposition' &&
          event.execution === 'local' &&
          event.result.success === true,
      ),
    );
    assert.equal(record.outcome.verification, 'passed');
    assert.equal(record.configuration.modelOptions.num_ctx, 4096);
    assert.equal(record.configuration.maxActions, 12);
    assert.doesNotMatch(raw, /저장하면 안 되는 모델 자연어 원문|저장하면 안 되는 모델 내부 추론/);
  });
});

test('실제 MCP 오류와 전달한 피드백 및 이후 모델 판단을 진단 기록에 남긴다', async () => {
  await withModel(async ({ requests, root, diagnosticDir, optionsFor, setScript }) => {
    setScript([
      call('browser_type', { target: '목적지', text: '가상역' }),
      call('report_completion', { success: true }),
    ]);
    const result = await runEvaluation(optionsFor(true), { tempRoot: root, diagnosticDir });
    assert.equal(result.termination, 'model_finished');
    assert.equal(result.modelClaim, true);
    assert.equal(result.verification, 'not_met');
    assert.equal(result.recoveryAttempts, 1);
    assert.equal(result.diagnostics.status, 'saved');
    const [name] = await readdir(diagnosticDir);
    const record = JSON.parse(await readFile(path.join(diagnosticDir, name), 'utf8'));
    const failure = record.events.find((event) => event.type === 'tool_failed');
    assert.equal(failure.execution, 'mcp_called');
    assert.equal(failure.isError, true);
    assert.ok(failure.mcpResult);
    const recovery = record.events.find((event) => event.type === 'tool_recovery');
    assert.equal(recovery.delivered, true);
    assert.equal(recovery.recoveryAttempts, 1);
    assert.match(recovery.feedback, /does not match any elements/);
    assert.match(recovery.feedback, /현재 화면:[\s\S]*textbox/);
    const nextRequest = record.events.filter((event) => event.type === 'model_request')[1];
    assert.match(nextRequest.snapshots.at(-1).text, /textbox/);
    assert.match(
      requests[1].messages.findLast((message) => message.role === 'tool').content,
      /does not match any elements/,
    );
    assert.ok(
      record.events.some(
        (event) => event.type === 'tool_disposition' && event.result?.success === true,
      ),
    );
    assert.equal(record.outcome.termination, 'model_finished');
    assert.equal(record.outcome.verification, 'not_met');
  });
});

test('오류 뒤 모델 대역이 고른 행동의 성공과 복구 횟수를 진단 기록에 남긴다', async () => {
  await withModel(async ({ root, diagnosticDir, optionsFor, setScript }) => {
    setScript([
      call('browser_type', { target: '목적지', text: '가상역' }),
      call('browser_type', { target: '#destination', text: '가상역' }),
      call('browser_click', { target: 'button:has-text("주차장 검색")' }),
      call('browser_click', { target: 'button:has-text("가람 주차장 선택")' }),
      call('report_completion', { success: true }),
    ]);
    const result = await runEvaluation(optionsFor(true), { tempRoot: root, diagnosticDir });
    assert.equal(result.verification, 'passed');
    assert.equal(result.recoveryAttempts, 1);
    assert.equal(result.recoveredActions, 1);
    assert.equal(result.actions, 4);
    const [name] = await readdir(diagnosticDir);
    const record = JSON.parse(await readFile(path.join(diagnosticDir, name), 'utf8'));
    const recoveryEvents = record.events.filter((event) => event.type === 'tool_recovery');
    assert.equal(recoveryEvents[0].status, 'feedback');
    assert.equal(recoveryEvents[0].delivered, true);
    assert.equal(recoveryEvents[1].status, 'action_succeeded');
    assert.equal(recoveryEvents[1].name, 'browser_type');
    assert.equal(record.outcome.recoveredActions, 1);
    assert.equal(record.configuration.maxConsecutiveErrors, 3);
  });
});

test('모델 응답 시간 초과 시 요청 스냅샷과 중단 결과를 저장한다', async () => {
  await withModel(async ({ root, diagnosticDir, optionsFor, setScript }) => {
    setScript(['hang']);
    const options = optionsFor(true);
    options.timeoutMs = 8_000;
    const result = await runEvaluation(options, { tempRoot: root, diagnosticDir });
    assert.equal(result.termination, 'timeout');
    assert.equal(result.diagnostics.status, 'saved');
    const [name] = await readdir(diagnosticDir);
    const record = JSON.parse(await readFile(path.join(diagnosticDir, name), 'utf8'));
    assert.ok(
      record.events.some((event) => event.type === 'model_request' && event.snapshots.length === 1),
    );
    assert.ok(
      record.events.some(
        (event) => event.type === 'model_request_error' && event.reason === 'aborted',
      ),
    );
    assert.equal(record.outcome.termination, 'timeout');
  });
});
