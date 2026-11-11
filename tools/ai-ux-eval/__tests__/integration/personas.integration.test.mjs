import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseOptions } from '../../options.mjs';
import { runEvaluation, verifySession } from '../../evaluation.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');

const call = (name, args) => ({
  role: 'assistant',
  content: '',
  tool_calls: [{ function: { name, arguments: args } }],
});

// 모델 대역만 정해진 행동을 반환한다. MCP, 격리 브라우저와 독립 검증기는 실제로 실행한다.
async function withModel(run) {
  let script = [];
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
      const next = script.shift();
      const message = typeof next === 'function' ? next(parsed) : next;
      if (!message) {
        response.writeHead(500).end();
        return;
      }
      response.end(JSON.stringify({ message }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'jumin-persona-test-'));
  const optionsFor = (persona) =>
    parseOptions(
      [
        '--scenario',
        'select-parking',
        '--persona',
        persona,
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
    await run({
      requests,
      tempRoot,
      optionsFor,
      setScript: (actions) => {
        script = [...actions];
      },
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(tempRoot, { recursive: true, force: true });
  }
}

const search = (destination = '가상역') => [
  call('browser_type', { target: '#destination', text: destination }),
  call('browser_click', { target: 'button:has-text("주차장 검색")' }),
];

test('화면 이동 후 접두사가 붙은 접근성 참조도 모델이 그대로 클릭할 수 있다', async () => {
  await withModel(async ({ tempRoot, optionsFor, setScript }) => {
    // 모델 대역은 실제로 전달된 결과 스냅샷에서 참조를 읽고, 고정된 ref를 사용하지 않는다.
    setScript([
      ...search(),
      (body) => {
        const description = body.tools.find((tool) => tool.function.name === 'browser_click')
          .function.parameters.properties.target.description;
        assert.match(description, /참조값을 그대로/);
        assert.doesNotMatch(description, /e숫자/);
        const snapshot = body.messages.findLast((message) => message.role === 'tool').content;
        const target = snapshot.match(/button "가람 주차장 선택" \[ref=([^\]]+)\]/)?.[1];
        assert.match(target, /^f\d+e\d+$/);
        return call('browser_click', { target });
      },
      call('report_completion', { success: true }),
    ]);
    const result = await runEvaluation(optionsFor('baseline'), { tempRoot });
    assert.equal(result.verification, 'passed', JSON.stringify(result));
    assert.equal(result.selectedParking, '가람 주차장');
    assert.deepEqual(await readdir(tempRoot), []);
  });
});

test('네 조건에 같은 과제를 전달하고 두 선택과 선호 일치를 별도로 판정한다', async () => {
  await withModel(async ({ requests, tempRoot, optionsFor, setScript }) => {
    let commonGoal;
    for (const [persona, parking, expectedPreference] of [
      ['baseline', '가람 주차장', 'not_applicable'],
      ['first-time', '다온 주차장', 'not_applicable'],
      ['price', '다온 주차장', 'not_matched'],
      ['walking', '다온 주차장', 'matched'],
    ]) {
      // 선택과 자기 보고는 모델 대역이 제공하며, 화면의 실제 상태로만 완료를 판정한다.
      requests.length = 0;
      setScript([
        ...search(),
        call('browser_click', { target: `button:has-text("${parking} 선택")` }),
        call('report_completion', { success: persona !== 'baseline' }),
      ]);
      const options = optionsFor(persona);
      commonGoal ||= options.scenario.goal;
      const result = await runEvaluation(options, { tempRoot });
      assert.equal(result.termination, 'model_finished', JSON.stringify(result));
      assert.equal(result.scenario, 'select-parking');
      assert.equal(result.persona, persona);
      assert.equal(result.modelClaim, persona !== 'baseline');
      assert.equal(result.verification, 'passed');
      assert.equal(result.destinationStatus, 'matched');
      assert.equal(result.searchedDestination, '가상역');
      assert.equal(result.selectedParking, parking);
      assert.equal(result.preference.status, expectedPreference);
      assert.equal(result.comparisonEvidence, 'not_assessed');
      assert.deepEqual(await readdir(tempRoot), []);

      // 네 모델 요청의 공통 목표는 같고 기준 조건에는 페르소나 문구가 없다.
      assert.equal(options.scenario.goal, commonGoal);
      const prompt = requests[0].messages.find((message) => message.role === 'user').content;
      assert.ok(prompt.includes(`공통 과제: ${commonGoal}`));
      if (persona === 'baseline') assert.doesNotMatch(prompt, /우선 관점:|처음 이용/);
      else assert.ok(prompt.includes(`우선 관점: ${options.persona.description}`));
      const resultSnapshot = requests[2].messages.findLast(
        (message) => message.role === 'tool',
      ).content;
      assert.match(resultSnapshot, /도보거리 600m/);
      assert.match(resultSnapshot, /도보거리 200m/);
      assert.match(resultSnapshot, /3,000원/);
      assert.match(resultSnapshot, /4,000원/);
    }
  });
});

test('모델이 성공을 보고해도 잘못된 목적지와 미선택을 구분한다', async () => {
  await withModel(async ({ tempRoot, optionsFor, setScript }) => {
    for (const [destination, expectedReason, expectedDestination] of [
      ['다른역', 'wrong_destination', 'mismatch'],
      ['', 'destination_not_searched', 'not_searched'],
      ['가상역', 'not_selected', 'matched'],
    ]) {
      setScript([...search(destination), call('report_completion', { success: true })]);
      const result = await runEvaluation(optionsFor('price'), { tempRoot });
      assert.equal(result.modelClaim, true);
      assert.equal(result.verification, 'not_met');
      assert.equal(result.verificationReason, expectedReason);
      assert.equal(result.destinationStatus, expectedDestination);
      assert.equal(result.searchedDestination, expectedDestination === 'matched' ? '가상역' : null);
      assert.equal(result.selectedParking, null);
      assert.equal(result.preference.status, 'unavailable');
      assert.deepEqual(await readdir(tempRoot), []);
    }
  });
});

test('같은 브라우저에서 선택 표시 증거가 사라지면 독립 검증은 판정 불가다', async () => {
  await withModel(async ({ tempRoot, optionsFor, setScript }) => {
    setScript([
      ...search(),
      call('browser_click', { target: 'button:has-text("가람 주차장 선택")' }),
      call('report_completion', { success: true }),
    ]);
    let checks = 0;
    const verifyPage = async (endpoint, origin, scenario, signal) => {
      checks += 1;
      if (checks === 2) {
        // 실제 선택은 이뤄졌지만 화면에 결과 표시가 없는 조건을 같은 CDP 세션에서 재현한다.
        const browser = await chromium.connectOverCDP(endpoint);
        try {
          const page = browser
            .contexts()
            .flatMap((context) => context.pages())
            .find((item) => item.url().startsWith(origin));
          await page.locator('[role="status"]').evaluate((element) => element.remove());
        } finally {
          await browser.close();
        }
      }
      return verifySession(endpoint, origin, scenario, signal);
    };
    const result = await runEvaluation(optionsFor('price'), { tempRoot, verifyPage });
    assert.equal(result.modelClaim, true);
    assert.equal(result.verification, 'unavailable');
    assert.equal(result.verificationReason, 'insufficient_evidence');
    assert.equal(result.destinationStatus, 'matched');
    assert.equal(result.searchedDestination, '가상역');
    assert.equal(result.selectedParking, null);
    assert.equal(result.preference.status, 'unavailable');
    assert.deepEqual(await readdir(tempRoot), []);
  });
});

test('검증기 실패나 모순된 완료 응답은 모델의 성공 보고와 관계없이 판정 불가다', async () => {
  await withModel(async ({ tempRoot, optionsFor, setScript }) => {
    for (const failure of ['throw', 'inconsistent']) {
      setScript([call('report_completion', { success: true })]);
      let checks = 0;
      const verifyPage = async () => {
        checks += 1;
        // 초기 상태는 대체하고 마지막 검증기의 장애 또는 선택 없는 완료 응답을 재현한다.
        if (checks === 1)
          return {
            verification: 'not_met',
            verificationReason: 'destination_not_searched',
            destinationStatus: 'not_searched',
            searchedDestination: null,
            selectedParking: null,
          };
        if (failure === 'throw') throw new Error('verifier unavailable');
        return {
          verification: 'passed',
          verificationReason: 'goal_observed',
          destinationStatus: 'matched',
          searchedDestination: '가상역',
          selectedParking: null,
        };
      };
      const result = await runEvaluation(optionsFor('price'), { tempRoot, verifyPage });
      assert.equal(result.modelClaim, true);
      assert.equal(result.verification, 'unavailable');
      assert.equal(result.verificationReason, 'verifier_error');
      assert.equal(result.selectedParking, null);
      assert.equal(result.preference.status, 'unavailable');
      assert.deepEqual(await readdir(tempRoot), []);
    }
  });
});
