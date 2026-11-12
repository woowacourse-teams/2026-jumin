import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { parseOptions } from '../../options.mjs';
import { runEvaluation, verifySession } from '../../evaluation.mjs';

const call = (name, args) => ({
  role: 'assistant',
  content: '',
  tool_calls: [{ function: { name, arguments: args } }],
});

// 모델 대역은 Ollama HTTP 계약만 대체한다. 브라우저, MCP, 화면과 독립 검증기는 실제로 실행한다.
async function withModel(handler, run) {
  const requests = [];
  const server = createServer(async (request, response) => {
    if (request.url === '/api/tags') {
      response.end(JSON.stringify({ models: [{ name: 'test-model' }] }));
      return;
    }
    if (request.url === '/api/show') {
      response.end(JSON.stringify({ capabilities: ['completion', 'tools'] }));
      return;
    }
    if (request.url === '/api/chat') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const parsed = JSON.parse(body);
      requests.push(parsed);
      const message = await handler(parsed, requests.length, response);
      if (message) response.end(JSON.stringify({ message }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'jumin-ai-ux-test-'));
  const options = parseOptions(
    [
      '--model',
      'test-model',
      '--ollama-url',
      `http://127.0.0.1:${server.address().port}`,
      '--timeout-seconds',
      '60',
    ],
    {},
  );
  try {
    await run({ requests, options, tempRoot });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(tempRoot, { recursive: true, force: true });
  }
}

test('실제 MCP 동작 결과를 다음 요청에 전달하고 다음 실행의 브라우저와 대화를 초기화한다', async () => {
  let mode = 'complete';
  let turn = 0;
  await withModel(
    async (body) => {
      turn += 1;
      if (mode === 'complete') {
        if (turn === 1) return call('browser_type', { target: '#destination', text: '가상역' });
        if (turn === 2) return call('browser_click', { target: 'button:has-text("주차장 검색")' });
        return call('report_completion', { success: true });
      }
      if (turn === 1) {
        const url = body.messages
          .find((message) => message.role === 'user')
          .content.match(/현재 화면 주소: (http:\/\/127\.0\.0\.1:\d+\/)/)[1];
        return call('browser_navigate', { url: `${url}results` });
      }
      return call('report_completion', { success: true });
    },
    async ({ requests, options, tempRoot }) => {
      // 첫 실행에서 실제 검색을 수행해 브라우저 저장소를 변경한다.
      const first = await runEvaluation(options, { tempRoot });
      assert.equal(first.termination, 'model_finished', JSON.stringify(first));
      assert.equal(first.modelClaim, true);
      assert.equal(first.verification, 'passed');
      assert.deepEqual(
        first.decisions.map((entry) => entry.previousToolResults),
        [0, 1, 2],
      );
      assert.equal(first.actions, 2);
      assert.deepEqual(await readdir(tempRoot), []);
      assert.deepEqual(
        requests[0].messages.map((message) => message.role),
        ['system', 'user'],
      );
      assert.match(
        requests[1].messages.findLast((message) => message.role === 'tool').content,
        /가상역/,
      );
      assert.match(
        requests[2].messages.findLast((message) => message.role === 'tool').content,
        /다온 주차장/,
      );

      // 두 번째 실행은 같은 모델 서버를 사용하되 새 대화와 빈 프로필이어야 한다.
      mode = 'isolation';
      turn = 0;
      const secondStart = requests.length;
      const second = await runEvaluation(options, { tempRoot });
      assert.deepEqual(
        requests[secondStart].messages.map((message) => message.role),
        ['system', 'user'],
      );
      assert.match(requests[secondStart].messages[1].content, /새로운 검색입니다/);
      assert.match(
        requests[secondStart + 1].messages.findLast((message) => message.role === 'tool').content,
        /검색 기록이 없습니다/,
      );
      assert.equal(second.modelClaim, true);
      assert.equal(second.verification, 'not_met');
      assert.deepEqual(await readdir(tempRoot), []);
    },
  );
});

test('실제 MCP 오류와 화면을 받은 모델 대역이 다음 행동을 선택해 과제를 마친다', async () => {
  let turn = 0;
  await withModel(
    async (body) => {
      turn += 1;
      if (turn === 1) return call('browser_type', { target: '목적지', text: '가상역' });
      if (turn === 2) {
        // 실제 MCP 실패와 복구 시점의 화면이 다음 모델 요청에 들어갔는지 확인한다.
        const feedback = body.messages.findLast((message) => message.role === 'tool').content;
        assert.match(feedback, /does not match any elements/);
        assert.match(feedback, /현재 화면:[\s\S]*textbox/);
        return call('browser_type', { target: '#destination', text: '가상역' });
      }
      if (turn === 3) return call('browser_click', { target: 'button:has-text("주차장 검색")' });
      return call('report_completion', { success: true });
    },
    async ({ requests, options, tempRoot }) => {
      const result = await runEvaluation(options, { tempRoot });
      assert.equal(result.termination, 'model_finished');
      assert.equal(result.modelClaim, true);
      assert.equal(result.verification, 'passed');
      assert.equal(result.actions, 3);
      assert.equal(result.recoverableErrors, 1);
      assert.equal(result.recoveryAttempts, 1);
      assert.equal(result.recoveredActions, 1);
      assert.equal(requests.length, 4);
      assert.deepEqual(result.cleanupErrors, []);
      assert.deepEqual(await readdir(tempRoot), []);
    },
  );
});

test('실제 MCP의 반복 오류가 연속 제한에 도달하면 더 요청하지 않는다', async () => {
  await withModel(
    async () => call('browser_type', { target: '목적지', text: '가상역' }),
    async ({ requests, options, tempRoot }) => {
      options.maxConsecutiveErrors = 2;
      const result = await runEvaluation(options, { tempRoot });
      assert.equal(result.termination, 'consecutive_error_limit');
      assert.equal(result.actions, 2);
      assert.equal(result.recoverableErrors, 2);
      assert.equal(result.recoveryAttempts, 1);
      assert.equal(result.recoveredActions, 0);
      assert.equal(requests.length, 2);
      assert.equal(result.verification, 'not_met');
      assert.deepEqual(await readdir(tempRoot), []);
    },
  );
});

test('실행 전용 브라우저가 종료되면 모델 호출을 중단하고 연결 종료로 구분한다', async () => {
  let endpoint;
  await withModel(
    async () => {
      // 검증기와 공유하는 임시 CDP 세션에서 이번 실행의 브라우저만 종료한다.
      const browser = await chromium.connectOverCDP(endpoint);
      const session = await browser.newBrowserCDPSession();
      await session.send('Browser.close').catch(() => {});
      await browser.close().catch(() => {});
      return call('browser_click', { target: '없는 대상' });
    },
    async ({ options, tempRoot }) => {
      const result = await runEvaluation(options, {
        tempRoot,
        verifyPage: async (...args) => {
          endpoint = args[0];
          return verifySession(...args);
        },
      });
      assert.equal(result.termination, 'browser_disconnected');
      assert.equal(result.verification, 'unavailable');
      assert.deepEqual(await readdir(tempRoot), []);
    },
  );
});

test('실제 MCP 오류를 전달한 뒤 모델이 멈춰도 전체 시간 제한과 정리가 유지된다', async () => {
  await withModel(
    async (body, turn) => {
      if (turn === 1) return call('browser_type', { target: '목적지', text: '가상역' });
      assert.match(
        body.messages.findLast((message) => message.role === 'tool').content,
        /실행 실패/,
      );
      return null;
    },
    async ({ requests, options, tempRoot }) => {
      options.timeoutMs = 9_000;
      const result = await runEvaluation(options, { tempRoot });
      assert.equal(result.termination, 'timeout');
      assert.equal(result.actions, 1);
      assert.equal(result.recoveryAttempts, 1);
      assert.equal(requests.length, 2);
      assert.equal(result.verification, 'unavailable');
      assert.deepEqual(result.cleanupErrors, []);
      assert.deepEqual(await readdir(tempRoot), []);
    },
  );
});

test('모델 응답이 멈추면 전체 시간 제한으로 종료하고 임시 파일을 정리한다', async () => {
  let chatStarted;
  const started = new Promise((resolve) => {
    chatStarted = resolve;
  });
  await withModel(
    async () => {
      chatStarted();
      return null;
    },
    async ({ options, tempRoot }) => {
      options.timeoutMs = 8_000;
      const evaluation = runEvaluation(options, { tempRoot });
      await Promise.race([
        started,
        evaluation.then(() => {
          throw new Error('모델 요청 전에 실행이 종료됐습니다.');
        }),
      ]);
      const result = await evaluation;
      assert.equal(result.termination, 'timeout');
      assert.equal(result.verification, 'unavailable');
      assert.deepEqual(result.cleanupErrors, []);
      assert.deepEqual(await readdir(tempRoot), []);
    },
  );
});

test('CLI의 중단 신호를 받으면 브라우저와 임시 프로필을 정리한다', async () => {
  let chatStarted;
  const started = new Promise((resolve) => {
    chatStarted = resolve;
  });
  await withModel(
    async () => {
      chatStarted();
      return null;
    },
    async ({ options }) => {
      // 브라우저가 열린 뒤 대기 중인 모델 요청에서 실제 CLI에 SIGINT를 보낸다.
      const before = new Set(
        (await readdir(os.tmpdir())).filter((name) => name.startsWith('jumin-ai-ux-run-')),
      );
      const runner = fileURLToPath(new URL('../../runner.mjs', import.meta.url));
      const child = spawn(
        process.execPath,
        [
          runner,
          '--model',
          'test-model',
          '--ollama-url',
          options.ollamaOrigin,
          '--timeout-seconds',
          '60',
        ],
        { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' },
      );
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
      child.stderr.resume();
      const exit = new Promise((resolve) =>
        child.once('close', (code, signal) => resolve({ code, signal })),
      );
      try {
        await Promise.race([
          started,
          exit.then(() => {
            throw new Error('모델 요청 전에 CLI가 종료됐습니다.');
          }),
        ]);
        if (process.platform === 'win32') child.kill('SIGINT');
        else process.kill(-child.pid, 'SIGINT');
        const state = await exit;
        assert.equal(state.signal, null);
        assert.equal(state.code, 1);
        const result = JSON.parse(output);
        assert.equal(result.termination, 'interrupted');
        assert.deepEqual(result.cleanupErrors, []);
        const after = (await readdir(os.tmpdir())).filter(
          (name) => name.startsWith('jumin-ai-ux-run-') && !before.has(name),
        );
        assert.deepEqual(after, []);
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }
    },
  );
});
