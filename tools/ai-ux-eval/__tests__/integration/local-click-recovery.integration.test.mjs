import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { reservePort } from '../../evaluation.mjs';
import { runLocalSmoke } from '../../local-smoke.mjs';
import { parseOptions } from '../../options.mjs';

const call = (name, args) => ({
  role: 'assistant',
  content: '',
  tool_calls: [{ function: { name, arguments: args } }],
});

test('실제 MCP 클릭 시간 초과 후 모델이 피드백을 받고 선택하며 반복 제한을 지킨다', async () => {
  let mode = 'recover';
  let requests = [];
  let observedFeedback = false;
  const model = createServer(async (req, res) => {
    if (req.url === '/api/tags')
      return res.end(JSON.stringify({ models: [{ name: 'qwen3.5:9b', digest: 'c'.repeat(64) }] }));
    if (req.url === '/api/ps') return res.end(JSON.stringify({ models: [] }));
    if (req.url === '/api/show')
      return res.end(
        JSON.stringify({
          capabilities: ['tools'],
          details: { runner: 'mock', quantization_level: 'Q4' },
        }),
      );
    if (req.url === '/api/chat') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      requests.push(data);
      if (mode === 'hang') return;
      const feedback = data.messages.filter((x) => x.role === 'tool');
      if (feedback.length) {
        observedFeedback ||=
          feedback[0].content.includes('클릭 동작 시간 초과') &&
          feedback[0].content.includes('현재 화면:') &&
          !feedback[0].content.includes('synthetic-secret');
        if (mode === 'recover' && requests.length === 2) {
          const line = feedback[0].content.split('\n').find((x) => x.includes('임의 입력'));
          const target = line?.match(/\[ref=([^\]]+)\]/)?.[1] || 'missing';
          return res.end(
            JSON.stringify({
              message: call('browser_type', { target, text: 'synthetic-private-input' }),
            }),
          );
        }
        if (mode === 'recover')
          return res.end(
            JSON.stringify({ message: call('report_completion', { success: false }) }),
          );
        if (mode === 'write') {
          const line = feedback
            .at(-1)
            .content.split('\n')
            .find((x) => x.includes('쓰기 테스트'));
          const target = line?.match(/\[ref=([^\]]+)\]/)?.[1] || 'missing';
          return res.end(JSON.stringify({ message: call('browser_click', { target }) }));
        }
      }
      const snapshot = feedback.length
        ? feedback.at(-1).content
        : data.messages.find((x) => x.role === 'user').content;
      const line = snapshot
        .split('\n')
        .find((x) => x.includes('textbox') && x.includes('목적지 검색'));
      const target = line?.match(/\[ref=([^\]]+)\]/)?.[1] || 'missing';
      return res.end(JSON.stringify({ message: call('browser_click', { target }) }));
    }
    res.writeHead(404).end();
  });
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumin-click-timeout-'));
  try {
    await new Promise((resolve) => model.listen(0, '127.0.0.1', resolve));
    const port = await reservePort(new AbortController().signal);
    const options = parseOptions(
      [
        '--mode',
        'local',
        '--local-url',
        `http://127.0.0.1:${port}`,
        '--model',
        'qwen3.5:9b',
        '--ollama-url',
        `http://127.0.0.1:${model.address().port}`,
        '--max-consecutive-errors',
        '2',
        '--timeout-seconds',
        '60',
      ],
      {},
    );
    const env = {
      ...process.env,
      NAVER_MAP_CLIENT_ID: 'synthetic-secret',
      API_PROXY_TARGET: 'http://127.0.0.1:12345',
    };
    const frontendLauncher = ({ port: p, env: childEnv, directory }) => {
      const script = `const h=require('node:http'),f=require('node:fs');h.createServer((q,r)=>{if(q.method!=='GET'){f.writeFileSync('write-reached','1');return r.writeHead(500).end()}if(q.url.startsWith('/api/parking/viewport?')){r.writeHead(200,{'content-type':'application/json'});return r.end('{"totalCount":0,"parkingLots":[]}')}r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(\`<!doctype html><script>window.naver={maps:{Map:function(){}}};fetch('/api/parking/viewport?southLatitude=37&westLongitude=127&northLatitude=38&eastLongitude=128');function requestSyntheticWrite(){fetch('/api/reports',{method:'POST'}).catch(()=>{})}</script><p>synthetic-secret</p><input aria-label="목적지 검색"><div style="position:fixed;inset:0;z-index:9999"><button onclick="requestSyntheticWrite()">쓰기 테스트</button><input aria-label="임의 입력"></div>\`)}).listen(${p},'127.0.0.1')`;
      return spawn(process.execPath, ['-e', script], {
        cwd: directory,
        env: childEnv,
        detached: true,
        stdio: 'ignore',
      });
    };
    const first = await runLocalSmoke(options, {
      env,
      clientDirectory: root,
      frontendLauncher,
      tempRoot: root,
    });
    assert.equal(first.termination, 'model_finished', JSON.stringify(first));
    assert.equal(first.modelClaim, false);
    assert.equal(first.verification, 'not_met');
    assert.equal(first.actions, 2);
    assert.equal(first.recoverableErrors, 1);
    assert.equal(first.recoveryAttempts, 1);
    assert.equal(first.recoveredActions, 1);
    assert.equal(first.clickEvents[0].target, 'search_input');
    assert.equal(first.clickEvents[0].outcome, 'click_timeout_feedback');
    assert.deepEqual(first.actionEvents[1], {
      tool: 'browser_type',
      target: 'other_input',
      context: 'unavailable',
      reference: 'unique',
      location: 'unavailable',
      state: 'not_marked_disabled',
      focus: 'clicked',
      outcome: 'success',
    });
    assert.doesNotMatch(JSON.stringify(first), /synthetic-private-input|synthetic-secret|f1e\d/);
    assert.equal(first.limits.actionTimeoutMs, 5000);
    assert.equal(first.limits.totalTimeoutMs, 60000);
    assert.equal(observedFeedback, true);
    assert.equal(requests.length, 3);
    assert.deepEqual(first.cleanupErrors, []);
    mode = 'repeat';
    requests = [];
    observedFeedback = false;
    const repeated = await runLocalSmoke(options, {
      env,
      clientDirectory: root,
      frontendLauncher,
      tempRoot: root,
    });
    assert.equal(repeated.termination, 'consecutive_error_limit', JSON.stringify(repeated));
    assert.equal(repeated.actions, 2);
    assert.equal(repeated.recoverableErrors, 2);
    assert.equal(repeated.recoveryAttempts, 1);
    assert.equal(requests.length, 2);
    assert.equal(observedFeedback, true);
    assert.deepEqual(repeated.cleanupErrors, []);
    mode = 'write';
    requests = [];
    const blocked = await runLocalSmoke(options, {
      env,
      clientDirectory: root,
      frontendLauncher,
      tempRoot: root,
    });
    assert.equal(blocked.termination, 'policy_violation', JSON.stringify(blocked));
    assert.equal(blocked.recoverableErrors, 1);
    assert.equal(blocked.modelRequests, 2);
    await assert.rejects(access(path.join(root, 'write-reached')), { code: 'ENOENT' });
    assert.deepEqual(blocked.cleanupErrors, []);
    mode = 'hang';
    requests = [];
    const timedOut = await runLocalSmoke(
      { ...options, timeoutMs: 7000 },
      { env, clientDirectory: root, frontendLauncher, tempRoot: root },
    );
    assert.equal(timedOut.termination, 'timeout', JSON.stringify(timedOut));
    assert.equal(timedOut.modelRequests, 1);
    assert.equal(requests.length, 1);
    assert.deepEqual(timedOut.cleanupErrors, []);
    assert.deepEqual(
      (await readdir(root)).filter((x) => x.startsWith('jumin-ai-ux-local-')),
      [],
    );
  } finally {
    model.closeAllConnections();
    if (model.listening) await new Promise((resolve) => model.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
