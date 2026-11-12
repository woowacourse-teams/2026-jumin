import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { access, mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { reservePort } from '../../evaluation.mjs';
import { runLocalSmoke } from '../../local-smoke.mjs';
import { parseOptions } from '../../options.mjs';
import { createLocalReport, saveLocalReport } from '../../local-report.mjs';

const toolCall = (name, args) => ({
  role: 'assistant',
  content: '',
  tool_calls: [{ function: { name, arguments: args } }],
});

// 실제 주민 서버 대신 가상 프런트와 모델 HTTP 대역으로 전체 로컬 실행 경로를 검증한다.
test('모델 대역이 격리 프런트를 조작하고 독립 검증기가 같은 세션을 확인한다', async () => {
  const requests = [];
  let modelMode = 'complete';
  let attemptWriteOnClick = false;
  let initialBlocked = false;
  let initialModal = false;
  const model = createServer(async (request, response) => {
    if (request.url === '/api/tags')
      return response.end(
        JSON.stringify({ models: [{ name: 'qwen3.5:9b', digest: 'a'.repeat(64) }] }),
      );
    if (request.url === '/api/ps') return response.end(JSON.stringify({ models: [] }));
    if (request.url === '/api/show')
      return response.end(
        JSON.stringify({
          capabilities: ['completion', 'tools'],
          details: { runner: 'mock', quantization_level: 'Q4' },
        }),
      );
    if (request.url === '/api/chat') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const data = JSON.parse(body);
      requests.push(data);
      if (modelMode === 'output-limit')
        return response.end(
          JSON.stringify({
            message: { role: 'assistant', content: '' },
            done_reason: 'length',
            prompt_eval_count: 42,
            eval_count: 1024,
          }),
        );
      if (modelMode === 'type-transition') {
        const feedback = data.messages.filter((item) => item.role === 'tool');
        if (feedback.length)
          return response.end(
            JSON.stringify({ message: toolCall('report_completion', { success: true }) }),
          );
        const snapshot = data.messages.find((item) => item.role === 'user').content;
        const line = snapshot
          .split('\n')
          .find((item) => item.includes('textbox') && item.includes('목적지 검색'));
        const ref = line?.match(/\[ref=([^\]]+)\]/)?.[1] || 'missing';
        return response.end(
          JSON.stringify({
            message: toolCall('browser_type', { target: ref, text: 'synthetic-private-input' }),
          }),
        );
      }
      if (modelMode === 'modal') {
        const feedback = data.messages.filter((item) => item.role === 'tool');
        if (requests.length >= 3)
          return response.end(
            JSON.stringify({ message: toolCall('report_completion', { success: true }) }),
          );
        const snapshot = feedback.length
          ? feedback.at(-1).content
          : data.messages.find((item) => item.role === 'user').content;
        const marker = feedback.length ? '목적지 검색' : '설문 닫기';
        const line = snapshot.split('\n').find((item) => item.includes(marker));
        const ref = line?.match(/\[ref=([^\]]+)\]/)?.[1] || 'missing';
        return response.end(
          JSON.stringify({ message: toolCall('browser_click', { target: ref }) }),
        );
      }
      if (modelMode === 'false-claim')
        return response.end(
          JSON.stringify({ message: toolCall('report_completion', { success: true }) }),
        );
      if (requests.length % 2 === 1) {
        const snapshot = data.messages.find((item) => item.role === 'user')?.content || '';
        const line = snapshot
          .split('\n')
          .find((item) => item.includes('textbox') && item.includes('목적지 검색'));
        const ref = line?.match(/\[ref=([^\]]+)\]/)?.[1] || 'missing';
        return response.end(
          JSON.stringify({ message: toolCall('browser_click', { target: ref }) }),
        );
      }
      return response.end(
        JSON.stringify({ message: toolCall('report_completion', { success: true }) }),
      );
    }
    response.writeHead(404).end();
  });
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumin-local-runner-'));
  const profiles = path.join(root, 'profiles');
  const clientDir = path.join(root, 'client');
  await mkdir(profiles);
  await mkdir(clientDir);
  try {
    await new Promise((resolve, reject) => {
      model.once('error', reject);
      model.listen(0, '127.0.0.1', resolve);
    });
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
      GA_MEASUREMENT_ID: 'synthetic-ga',
      CLARITY_PROJECT_ID: 'synthetic-clarity',
      SENTRY_DSN: 'synthetic-dsn',
      SENTRY_AUTH_TOKEN: 'synthetic-token',
    };
    const frontendLauncher = ({ port: listenPort, env: childEnv, directory }) => {
      const script = `const http=require('node:http');if(process.env.GA_MEASUREMENT_ID||process.env.CLARITY_PROJECT_ID||process.env.SENTRY_DSN||process.env.SENTRY_AUTH_TOKEN)process.exit(7);http.createServer((req,res)=>{if(req.method!=='GET'){require('node:fs').writeFileSync('write-received','1');return res.writeHead(500).end()}if(req.url.startsWith('/api/parking/viewport?')){res.writeHead(200,{'content-type':'application/json'});return res.end('{"totalCount":0,"parkingLots":[]}')}res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(\`<!doctype html><div id="home" ${initialModal ? 'aria-hidden="true"' : ''}><p id="profile">이전 상태 없음</p><script>if(localStorage.getItem('fixture_visit'))document.getElementById('profile').textContent='이전 상태 있음';window.naver={maps:{Map:function(){}}};fetch('/api/parking/viewport?southLatitude=37&westLongitude=127&northLatitude=38&eastLongitude=128');if(${initialBlocked})fetch('/api/reports',{method:'POST',body:'synthetic'}).catch(()=>{});function closeSurvey(){document.getElementById('home').removeAttribute('aria-hidden');document.getElementById('survey').remove()}function openSearch(){localStorage.setItem('fixture_visit','1');if(${attemptWriteOnClick})fetch('/api/reports',{method:'POST',body:'synthetic'}).catch(()=>{});history.pushState({},'', '/search?lat=37.4981&lng=127.0279')}</script>${initialBlocked ? '<iframe src="https://untrusted.invalid/"></iframe>' : ''}<p>synthetic-map-key sample.person@example.com</p><input aria-label="목적지 검색" onclick="openSearch()"></div>${initialModal ? '<div id="survey" role="dialog" aria-label="서비스 이용 경험 설문"><button aria-label="서비스 이용 경험 설문 닫기" onclick="closeSurvey()">설문 닫기</button></div>' : ''}\`)}).listen(Number(process.env.LOCAL_SMOKE_FAKE_PORT),'127.0.0.1')`;
      return spawn(process.execPath, ['-e', script], {
        cwd: directory,
        env: { ...childEnv, LOCAL_SMOKE_FAKE_PORT: String(listenPort) },
        detached: process.platform !== 'win32',
        stdio: 'ignore',
      });
    };
    const result = await runLocalSmoke(options, {
      env,
      clientDirectory: clientDir,
      frontendLauncher,
      tempRoot: profiles,
    });
    assert.equal(result.termination, 'model_finished', JSON.stringify(result));
    assert.equal(result.modelClaim, true);
    assert.equal(result.verification, 'passed');
    assert.equal(result.environment.backendLookupSucceeded, true);
    assert.equal(result.environment.analyticsOptOut, true);
    assert.equal(result.safety.analyticsAttempts, 0);
    assert.equal(result.safety.blockedWrites, 0);
    assert.equal(result.modelInfo.digest, 'a'.repeat(64));
    assert.equal(requests.length, 2);
    const first = JSON.stringify(requests[0]);
    assert.doesNotMatch(first, /synthetic-map-key|sample\.person@example\.com/);
    assert.deepEqual(result.cleanupErrors, []);
    assert.deepEqual(await readdir(profiles), []);

    // 첫 실행의 로컬 저장소와 모델 대화가 다음 임시 프로필로 이어지지 않아야 한다.
    const localhostOptions = { ...options, localUrl: `http://localhost:${port}/` };
    const second = await runLocalSmoke(localhostOptions, {
      env,
      clientDirectory: clientDir,
      frontendLauncher,
      tempRoot: profiles,
    });
    assert.equal(second.termination, 'model_finished', JSON.stringify(second));
    assert.equal(second.verification, 'passed');
    assert.equal(requests.length, 4);
    assert.deepEqual(
      requests[2].messages.map((message) => message.role),
      ['system', 'user'],
    );
    assert.match(requests[2].messages[1].content, /이전 상태 없음/);
    assert.doesNotMatch(requests[2].messages[1].content, /이전 상태 있음/);
    assert.deepEqual(second.cleanupErrors, []);
    assert.deepEqual(await readdir(profiles), []);

    // 홈 입력란은 클릭해야 검색 화면으로 전환된다. 이전 화면에 값을 채우지 않는다.
    modelMode = 'type-transition';
    requests.length = 0;
    const typeTransition = await runLocalSmoke(options, {
      env,
      clientDirectory: clientDir,
      frontendLauncher,
      tempRoot: profiles,
    });
    assert.equal(typeTransition.verification, 'passed', JSON.stringify(typeTransition));
    assert.equal(typeTransition.actionEvents[0].focus, 'clicked');
    assert.equal(typeTransition.actionEvents[0].outcome, 'focus_transition');
    assert.match(
      requests[1].messages.findLast((message) => message.role === 'tool').content,
      /텍스트는 아직 입력하지 않았습니다/,
    );
    assert.doesNotMatch(JSON.stringify(typeTransition), /synthetic-private-input/);
    const typeReport = createLocalReport(typeTransition, { options, source: 'local_run' });
    assert.equal(typeReport.actions[0].focus, 'clicked');
    assert.equal(typeReport.actions[0].outcome, 'focus_transition');

    // 출력이 잘린 모델 응답은 완료가 아니며 일반 연결 오류와 구분한다.
    modelMode = 'output-limit';
    const outputLimit = await runLocalSmoke(options, {
      env,
      clientDirectory: clientDir,
      frontendLauncher,
      tempRoot: profiles,
    });
    assert.equal(outputLimit.termination, 'model_output_limit');
    assert.equal(outputLimit.modelClaim, null);
    assert.equal(outputLimit.actions, 0);
    assert.equal(outputLimit.modelCalls[0].inputTokens, 42);
    assert.equal(outputLimit.modelCalls[0].outputTokens, 1024);
    assert.equal(outputLimit.modelCalls[0].doneReason, 'length');
    assert.equal(outputLimit.modelCalls[0].responseKind, 'empty');
    assert.equal(
      createLocalReport(outputLimit, { options, source: 'local_run' }).modelCalls[0].outputTokens,
      1024,
    );
    assert.equal(
      createLocalReport(outputLimit, { options, source: 'local_run' }).termination,
      'model_output_limit',
    );

    // 모델의 성공 주장만으로 검색 화면 도달을 인정하지 않는다.
    modelMode = 'false-claim';
    const falseClaim = await runLocalSmoke(options, {
      env,
      clientDirectory: clientDir,
      frontendLauncher,
      tempRoot: profiles,
    });
    assert.equal(falseClaim.modelClaim, true);
    assert.equal(falseClaim.verification, 'not_met');
    assert.equal(falseClaim.verificationReason, 'home_screen_observed');
    assert.deepEqual(falseClaim.cleanupErrors, []);
    assert.deepEqual(await readdir(profiles), []);

    // 초기 모달은 모델이 직접 닫고 검색을 선택한다. 실행기가 대신 클릭하지 않는다.
    initialModal = true;
    modelMode = 'modal';
    requests.length = 0;
    const withModal = await runLocalSmoke(options, {
      env,
      clientDirectory: clientDir,
      frontendLauncher,
      tempRoot: profiles,
    });
    assert.equal(withModal.termination, 'model_finished', JSON.stringify(withModal));
    assert.equal(withModal.environment.searchInputVisible, false);
    assert.equal(withModal.environment.searchInputPresent, true);
    assert.equal(withModal.environment.surveyDialogVisible, true);
    assert.equal(withModal.modelClaim, true);
    assert.equal(withModal.verification, 'passed');
    assert.deepEqual(withModal.finalState, {
      surveyDialogVisible: false,
      searchInputVisible: true,
      searchInputPresent: true,
    });
    assert.equal(withModal.actions, 2);
    // MCP 스냅샷이 실제 첫 모델 요청까지 전달되고 참조가 모달 내부에 연결되는지 확인한다.
    assert.equal(withModal.initialScreenEvidence.surveyModal, true);
    assert.equal(withModal.initialScreenEvidence.surveyClose, true);
    assert.equal(withModal.initialScreenEvidence.firstRequestContainsSnapshot, true);
    assert.equal(withModal.actionEvents[0].reference, 'unique');
    assert.equal(withModal.actionEvents[0].location, 'inside_survey_modal');
    assert.ok(requests[0].messages[1].content.includes('서비스 이용 경험 설문 닫기'));
    assert.equal(requests.length, 3);
    assert.deepEqual(withModal.cleanupErrors, []);
    modelMode = 'false-claim';
    requests.length = 0;
    const modalFalseClaim = await runLocalSmoke(options, {
      env,
      clientDirectory: clientDir,
      frontendLauncher,
      tempRoot: profiles,
    });
    assert.equal(modalFalseClaim.modelClaim, true);
    assert.equal(modalFalseClaim.verification, 'not_met');
    assert.equal(modalFalseClaim.verificationReason, 'home_screen_observed');
    assert.deepEqual(modalFalseClaim.finalState, {
      surveyDialogVisible: true,
      searchInputVisible: false,
      searchInputPresent: true,
    });
    assert.equal(modalFalseClaim.actions, 0);
    assert.deepEqual(modalFalseClaim.cleanupErrors, []);
    const report = createLocalReport(modalFalseClaim, { options, source: 'local_run' });
    const reportDir = await saveLocalReport(report, path.join(root, 'reports'));
    const saved = JSON.parse(await readFile(path.join(reportDir, 'result.json'), 'utf8'));
    const markdown = await readFile(path.join(reportDir, 'report.md'), 'utf8');
    assert.equal(saved.modelClaim, true);
    assert.equal(saved.verification, 'not_met');
    assert.equal(saved.finalState.surveyDialogVisible, true);
    assert.doesNotMatch(
      JSON.stringify(saved) + markdown,
      /synthetic-map-key|sample\.person@example\.com|127\.0\.0\.1|https?:\/\//,
    );
    initialModal = false;

    // 초기 요청은 서버에 닿지 않지만 차단 횟수를 보존하고 모델 판단을 허용한다.
    initialBlocked = true;
    modelMode = 'complete';
    requests.length = 0;
    const initial = await runLocalSmoke(options, {
      env,
      clientDirectory: clientDir,
      frontendLauncher,
      tempRoot: profiles,
    });
    assert.equal(initial.termination, 'model_finished', JSON.stringify(initial));
    assert.equal(initial.initialSafety.blockedWrites, 1);
    assert.equal(initial.initialSafety.blockedNavigations, 1);
    assert.ok(
      initial.blockedSummary.some((entry) => entry.phase === 'initial' && entry.reason === 'write'),
    );
    assert.doesNotMatch(
      JSON.stringify(initial.blockedSummary),
      /synthetic-map-key|127\.0\.0\.1|\?/,
    );
    await assert.rejects(access(path.join(clientDir, 'write-received')), { code: 'ENOENT' });

    // 클릭 중 발생한 가상 쓰기 요청은 서버에 닿지 않고 다음 모델 판단 전에 중단된다.
    attemptWriteOnClick = true;
    modelMode = 'complete';
    requests.length = 0;
    const blockedWrite = await runLocalSmoke(options, {
      env,
      clientDirectory: clientDir,
      frontendLauncher,
      tempRoot: profiles,
    });
    assert.equal(blockedWrite.termination, 'policy_violation', JSON.stringify(blockedWrite));
    assert.equal(blockedWrite.initialSafety.blockedWrites, 1);
    assert.equal(blockedWrite.safety.blockedWrites, 2);
    assert.ok(
      blockedWrite.blockedSummary.some(
        (entry) => entry.phase === 'after_readiness' && entry.reason === 'write',
      ),
    );
    assert.equal(blockedWrite.modelRequests, 1);
    assert.equal(blockedWrite.modelClaim, null);
    await assert.rejects(access(path.join(clientDir, 'write-received')), { code: 'ENOENT' });
    assert.deepEqual(blockedWrite.cleanupErrors, []);
    assert.deepEqual(await readdir(profiles), []);
  } finally {
    model.closeAllConnections();
    if (model.listening) await new Promise((resolve) => model.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test('필수 환경이 없으면 프런트와 모델 실행을 시작하지 않는다', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumin-local-missing-'));
  try {
    const options = parseOptions(
      [
        '--mode',
        'local',
        '--local-url',
        'http://127.0.0.1:3000',
        '--model',
        'qwen3.5:9b',
        '--ollama-url',
        'http://127.0.0.1:1',
        '--timeout-seconds',
        '5',
      ],
      {},
    );
    let launched = false;
    const result = await runLocalSmoke(options, {
      env: {},
      clientDirectory: root,
      frontendLauncher: () => {
        launched = true;
        throw new Error('실행되면 안 됨');
      },
    });
    assert.equal(result.termination, 'environment_error');
    assert.equal(result.environment.mapKeyConfigured, false);
    assert.equal(result.environment.backendConfigured, false);
    assert.equal(result.environment.modelServerAvailable, false);
    assert.equal(result.environment.modelAvailable, null);
    assert.equal(result.environment.modelToolSupport, null);
    assert.equal(launched, false);
    assert.equal(result.modelRequests, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('지도 SDK와 dev 조회 오류는 모델 행동 전에 환경 문제로 구분한다', async () => {
  let modelRequests = 0;
  const model = createServer((request, response) => {
    if (request.url === '/api/tags')
      return response.end(
        JSON.stringify({ models: [{ name: 'qwen3.5:9b', digest: 'b'.repeat(64) }] }),
      );
    if (request.url === '/api/ps') return response.end(JSON.stringify({ models: [] }));
    if (request.url === '/api/show')
      return response.end(
        JSON.stringify({
          capabilities: ['tools'],
          details: { runner: 'mock', quantization_level: 'Q4' },
        }),
      );
    if (request.url === '/api/chat') modelRequests += 1;
    response.writeHead(500).end();
  });
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumin-local-readiness-'));
  try {
    await new Promise((resolve, reject) => {
      model.once('error', reject);
      model.listen(0, '127.0.0.1', resolve);
    });
    const env = {
      ...process.env,
      NAVER_MAP_CLIENT_ID: 'synthetic-key',
      API_PROXY_TARGET: 'http://127.0.0.1:12345',
    };
    for (const mode of ['map', 'backend', 'invalid']) {
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
          '30',
        ],
        {},
      );
      const frontendLauncher = ({ port: listenPort, env: childEnv, directory }) => {
        const script = `const http=require('node:http');http.createServer((req,res)=>{if(req.url.startsWith('/api/parking/viewport?')){res.writeHead(process.env.LOCAL_SMOKE_FAKE_MODE==='backend'?500:200);return res.end(process.env.LOCAL_SMOKE_FAKE_MODE==='invalid'?'{}':'{"totalCount":0,"parkingLots":[]}')}res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(\`<!doctype html><script>if('${mode}'!=='map')window.naver={maps:{Map:function(){}}};if('${mode}'==='map'){fetch('/api/blocked',{method:'POST'}).catch(()=>{});setTimeout(()=>{throw Error('synthetic-private-error')},0)};fetch('/api/parking/viewport?southLatitude=37&westLongitude=127&northLatitude=38&eastLongitude=128').catch(()=>{})</script><input aria-label="목적지 검색">\`)}).listen(Number(process.env.LOCAL_SMOKE_FAKE_PORT),'127.0.0.1')`;
        return spawn(process.execPath, ['-e', script], {
          cwd: directory,
          env: {
            ...childEnv,
            LOCAL_SMOKE_FAKE_PORT: String(listenPort),
            LOCAL_SMOKE_FAKE_MODE: mode,
          },
          detached: process.platform !== 'win32',
          stdio: 'ignore',
        });
      };
      const result = await runLocalSmoke(options, {
        env,
        clientDirectory: root,
        frontendLauncher,
        tempRoot: root,
        readinessTimeoutMs: 1_000,
      });
      assert.equal(
        result.termination,
        mode === 'map' ? 'map_sdk_error' : 'backend_error',
        JSON.stringify(result),
      );
      assert.equal(result.verification, 'unavailable');
      if (mode === 'map') {
        assert.equal(result.initialSafety.blockedWrites, 1);
        assert.equal(result.environment.mapSdkAvailable, false);
        assert.equal(result.environment.analyticsOptOut, true);
        assert.equal(result.environment.searchInputVisible, true);
        assert.equal(result.environment.sdkScriptElementPresent, false);
        assert.equal(result.environment.appRootHasContent, false);
        assert.ok(result.environment.pageErrorCount >= 1);
        assert.doesNotMatch(JSON.stringify(result), /synthetic-private-error/);
      }
      assert.equal(result.modelRequests, 0);
      assert.deepEqual(result.cleanupErrors, []);
    }
    assert.equal(modelRequests, 0);
  } finally {
    model.closeAllConnections();
    if (model.listening) await new Promise((resolve) => model.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
