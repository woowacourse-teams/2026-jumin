import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { compareFixtures, saveComparison } from '../../compare.mjs';
import { parseOptions } from '../../options.mjs';
import { fixtureAction } from '../../fixture-evidence.mjs';

const call = (name, args) => ({
  role: 'assistant',
  content: '',
  tool_calls: [{ function: { name, arguments: args } }],
});

test('스냅샷에서 확인된 참조만 가상 행동 대상으로 기록한다', () => {
  const snapshot = '- textbox "목적지" [ref=e7]\n- button "주차장 검색" [ref=e8]';
  const known = fixtureAction('browser_type', { target: 'e7', text: '가상역' }, snapshot, 1);
  const unknown = fixtureAction('browser_type', { target: 'e99', text: '임의 입력' }, snapshot, 2);
  assert.equal(known.target, '목적지 입력란');
  assert.equal(unknown.target, 'unavailable');
  assert.equal(unknown.input, 'other_or_unavailable');
});

// 모델 대역만 행동을 반환하며 실제 MCP·새 브라우저·별도 검증기로 여섯 실행을 확인한다.
test('두 가상 버전과 세 관점을 격리 실행하고 JSON·Markdown으로 남긴다', async () => {
  const initialMessages = [];
  const server = createServer(async (req, res) => {
    if (req.url === '/api/tags')
      return res.end(JSON.stringify({ models: [{ name: 'fixture-stub' }] }));
    if (req.url === '/api/show') return res.end(JSON.stringify({ capabilities: ['tools'] }));
    if (req.url === '/api/chat') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const data = JSON.parse(body);
      const count = data.messages.filter((m) => m.role === 'tool').length;
      if (count === 0) initialMessages.push(data.messages);
      const sequence = [
        call('browser_click', { target: 'does-not-exist' }),
        call('browser_type', { target: '#destination', text: '가상역' }),
        call('browser_click', { target: 'button:has-text("주차장 검색")' }),
        call('browser_click', { target: 'button:has-text("가람 주차장 선택")' }),
        call('report_completion', { success: true }),
      ];
      return res.end(JSON.stringify({ message: sequence[count] }));
    }
    res.writeHead(404).end();
  });
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumin-compare-'));
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const options = parseOptions(
      [
        '--scenario',
        'select-parking',
        '--model',
        'fixture-stub',
        '--ollama-url',
        `http://127.0.0.1:${server.address().port}`,
        '--timeout-seconds',
        '60',
      ],
      {},
    );
    const report = await compareFixtures(options);
    assert.equal(report.runs.length, 6);
    assert.deepEqual(
      report.runs.map((x) => x.persona),
      ['baseline', 'price', 'walking', 'baseline', 'price', 'walking'],
    );
    assert.ok(
      report.runs.every(
        (x) =>
          x.verification === 'passed' &&
          x.modelClaim === true &&
          x.selectedParking === '가람 주차장',
      ),
    );
    assert.notEqual(report.runs[0].screenSha256, report.runs[3].screenSha256);
    const actions = report.runs[0].actionEvidence;
    assert.equal(actions[0].outcome, 'mcp_error');
    assert.equal(actions[0].target, 'unavailable');
    assert.equal(actions[0].after.screen, 'search');
    assert.equal(actions[1].target, '목적지 입력란');
    assert.equal(actions[1].input, '가상역');
    assert.equal(actions[1].outcome, 'success');
    assert.ok(actions[1].after.observed.includes('목적지 입력란: 가상역'));
    assert.equal(actions[2].target, '주차장 검색 버튼');
    assert.equal(actions[2].after.screen, 'results');
    assert.equal(actions[3].target, '가람 주차장 선택 버튼');
    assert.ok(actions[3].after.observed.includes('가람 주차장 선택 표시'));
    assert.equal(initialMessages.length, 6);
    assert.ok(
      initialMessages.every(
        (messages) => messages.length === 2 && messages[1].content.includes('새로운 검색'),
      ),
    );
    const output = await saveComparison(report, root);
    const json = JSON.parse(await readFile(path.join(output, 'result.json'), 'utf8'));
    const markdown = await readFile(path.join(output, 'report.md'), 'utf8');
    assert.equal(json.scope, 'synthetic_fixture_development_only');
    assert.match(markdown, /실제 주민 화면 A\/B나 실제 사용자 결과가 아니다/);
    assert.match(markdown, /목적지 입력란.*가상역.*success/);
    assert.match(markdown, /mcp_error/);
    assert.equal(json.runs[0].actionEvidence[1].target, '목적지 입력란');
    assert.equal((markdown.match(/\| fixture-[ab] \|/g) || []).length, 6);
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test('모델의 성공 주장만 있고 검증 근거가 없으면 판정 불가로 남긴다', async () => {
  const options = parseOptions(['--scenario', 'select-parking', '--model', 'fixture-stub'], {});
  const report = await compareFixtures(options, {
    run: async (selected) => ({
      screenSha256: createHash('sha256')
        .update(
          await readFile(
            new URL(
              selected.fixtureVersion === 'fixture-b'
                ? '../../scenarios/nearby-parking-b.html'
                : '../../scenarios/nearby-parking.html',
              import.meta.url,
            ),
          ),
        )
        .digest('hex'),
      modelClaim: true,
      verification: 'unavailable',
      verificationReason: 'insufficient_evidence',
    }),
  });
  assert.ok(report.runs.every((x) => x.modelClaim === true && x.verification === 'unavailable'));
  assert.ok(report.runs.every((x) => x.verificationReason === 'insufficient_evidence'));
});

test('중단 신호 후에는 남은 조건을 실행하지 않는다', async () => {
  const options = parseOptions(['--scenario', 'select-parking', '--model', 'fixture-stub'], {});
  const controller = new AbortController();
  let calls = 0;
  const report = await compareFixtures(options, {
    signal: controller.signal,
    run: async (_options, { signal }) => {
      assert.equal(signal, controller.signal);
      calls++;
      controller.abort();
      return { termination: 'interrupted', verification: 'unavailable' };
    },
  });
  assert.equal(calls, 1);
  assert.equal(report.complete, false);
  assert.equal(report.runs.length, 1);
});
