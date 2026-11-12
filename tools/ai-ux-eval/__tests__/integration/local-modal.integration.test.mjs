import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { reservePort } from '../../evaluation.mjs';
import { runLocalSmoke } from '../../local-smoke.mjs';
import { parseOptions } from '../../options.mjs';
import { createLocalReport } from '../../local-report.mjs';

const call = (name, args) => ({
  role: 'assistant',
  content: '',
  tool_calls: [{ function: { name, arguments: args } }],
});

// 로컬 가상 앱과 모델 대역으로 MCP가 가려진 입력을 성공 처리하는 상황을 재현한다.
test('활성 모달 뒤 입력을 차단하고 모델이 모달을 직접 처리한 뒤 검색할 수 있다', async () => {
  const requests = [];
  const model = createServer(async (req, res) => {
    if (req.url === '/api/tags')
      return res.end(JSON.stringify({ models: [{ name: 'qwen3.5:9b', digest: 'a'.repeat(64) }] }));
    if (req.url === '/api/ps') return res.end(JSON.stringify({ models: [] }));
    if (req.url === '/api/show')
      return res.end(
        JSON.stringify({
          capabilities: ['tools'],
          details: { runner: 'mock', quantization_level: 'Q4' },
        }),
      );
    if (req.url !== '/api/chat') return res.writeHead(404).end();
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    requests.push(request);
    const feedback = request.messages.filter((message) => message.role === 'tool');
    const turns = requests.length - 1;
    if (turns >= 3)
      return res.end(JSON.stringify({ message: call('report_completion', { success: true }) }));
    const snapshot = feedback.length
      ? feedback.at(-1).content
      : request.messages.find((message) => message.role === 'user').content;
    const marker = ['가려진 입력', '설문 닫기', '목적지 검색'][turns];
    const line = snapshot.split('\n').find((item) => item.includes(marker));
    const target = line?.match(/\[ref=([^\]]+)\]/)?.[1] || 'missing';
    const message = feedback.length
      ? call('browser_click', { target })
      : call('browser_type', { target, text: 'synthetic-input' });
    return res.end(JSON.stringify({ message }));
  });
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumin-modal-test-'));
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
        '--timeout-seconds',
        '60',
      ],
      {},
    );
    const env = {
      ...process.env,
      NAVER_MAP_CLIENT_ID: 'synthetic-map-key',
      API_PROXY_TARGET: 'http://127.0.0.1:12345',
    };
    const frontendLauncher = ({ port: appPort, env: childEnv, directory }) => {
      const script = `const http=require('node:http');http.createServer((q,r)=>{if(q.url.startsWith('/api/parking/viewport?'))return r.end('{"totalCount":0,"parkingLots":[]}');r.writeHead(200,{'content-type':'text/html; charset=utf-8'});r.end(\`<!doctype html><div id="root" aria-hidden="true"><input aria-label="목적지 검색" onclick="history.pushState({},'', '/search')"></div><input aria-label="가려진 입력" oninput="fetch('/api/reports',{method:'POST'}).catch(()=>{})"><div id="overlay" style="position:fixed;inset:0;background:white"><div role="dialog" aria-modal="true" aria-label="서비스 이용 경험 설문"><button aria-label="서비스 이용 경험 설문 닫기" onclick="document.getElementById('root').removeAttribute('aria-hidden');document.getElementById('overlay').remove()">설문 닫기</button></div></div><script>window.naver={maps:{Map:function(){}}};fetch('/api/parking/viewport?southLatitude=37&westLongitude=127&northLatitude=38&eastLongitude=128')</script>\`)}).listen(${appPort},'127.0.0.1')`;
      return spawn(process.execPath, ['-e', script], {
        cwd: directory,
        env: childEnv,
        detached: true,
        stdio: 'ignore',
      });
    };
    const result = await runLocalSmoke(options, {
      env,
      clientDirectory: root,
      frontendLauncher,
      tempRoot: root,
    });

    // 첫 입력은 실행하지 않고 피드백하며, 다음 클릭들은 모델 대역이 선택한다.
    assert.equal(result.actionEvents[0].outcome, 'modal_blocked_feedback', JSON.stringify(result));
    assert.equal(result.actionEvents[0].location, 'outside_survey_modal');
    assert.match(
      requests[1].messages.findLast((message) => message.role === 'tool').content,
      /대화상자/,
    );
    assert.equal(result.actionEvents[1].location, 'inside_survey_modal');
    assert.equal(result.modelClaim, true);
    assert.equal(result.verification, 'passed');
    assert.equal(result.safety.blockedWrites, 0);
    assert.equal(result.interactionPolicy, 'modal-focus-v3');
    const report = createLocalReport(result, { options, source: 'local_run' });
    assert.equal(report.actions[0].outcome, 'modal_blocked_feedback');
    assert.equal(report.interactionPolicy, 'modal-focus-v3');
    assert.doesNotMatch(JSON.stringify(report), /synthetic-input|synthetic-map-key|f1e\d/);
  } finally {
    model.closeAllConnections();
    if (model.listening) await new Promise((resolve) => model.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
