import assert from 'node:assert/strict';
import test from 'node:test';
import { composeTask, EvaluationError, RecoverableToolError, runAgent } from '../../agent.mjs';
import { classifyMcpFailure } from '../../evaluation.mjs';
import { parseOptions } from '../../options.mjs';

const available = ['browser_snapshot', 'browser_click', 'browser_type', 'browser_navigate'].map(
  (name) => ({ name, description: name }),
);
const signal = new AbortController().signal;
const call = (name, args) => ({
  role: 'assistant',
  content: '',
  tool_calls: [{ function: { name, arguments: args } }],
});
const input = (overrides = {}) => ({
  scenario: { goal: '가상 과제를 수행하세요.' },
  fixtureUrl: 'http://127.0.0.1:1234/',
  initialSnapshot: '가상 화면',
  maxActions: 5,
  available,
  signal,
  decisions: [],
  ...overrides,
});

test('두 시나리오의 네 조건은 동일한 공통 목표를 쓰고 기준에는 추가 관점이 없다', () => {
  for (const scenario of ['nearby-parking', 'select-parking']) {
    const options = ['baseline', 'first-time', 'price', 'walking'].map((persona) =>
      parseOptions(['--scenario', scenario, '--persona', persona], {}),
    );
    const goal = options[0].scenario.goal;
    assert.doesNotMatch(goal, /처음 이용/);
    for (const item of options) {
      assert.equal(item.scenario.goal, goal);
      assert.ok(composeTask(item.scenario, item.persona).startsWith(`공통 과제: ${goal}`));
    }
    assert.equal(composeTask(options[0].scenario, options[0].persona), `공통 과제: ${goal}`);
    assert.doesNotMatch(
      composeTask(options[0].scenario, options[0].persona),
      /우선 관점|처음 이용/,
    );
    for (const item of options.slice(1))
      assert.match(composeTask(item.scenario, item.persona), /우선 관점:/);
  }
});

// 로컬 대화가 길어져도 다음 판단에 동일한 과제와 페르소나가 포함되어야 한다.
test('실제 화면의 다음 판단에 공통 과제와 관점을 다시 전달한다', async () => {
  let turn = 0;
  await runAgent(
    input({
      localMode: true,
      persona: { description: '가상 관점' },
      chat: async (messages) => {
        turn += 1;
        if (turn === 1) return call('browser_snapshot', {});
        assert.match(messages.at(-1).content, /공통 과제: 가상 과제를 수행하세요/);
        assert.match(messages.at(-1).content, /우선 관점: 가상 관점/);
        return call('report_completion', { success: false });
      },
      callTool: async () => '가상 화면',
    }),
  );
  assert.equal(turn, 2);
});

// 모델 대역은 실제 추론을 검증하지 않고, 도구 결과가 다음 판단 입력에 이어지는 계약만 검증한다.
test('도구 결과를 다음 모델 요청에 넣고 자기 판정은 별도로 반환한다', async () => {
  const decisions = [];
  let turn = 0;
  const result = await runAgent(
    input({
      decisions,
      chat: async (messages) => {
        turn += 1;
        if (turn === 1) return call('browser_type', { target: 'e1', text: '가상역' });
        if (turn === 2) {
          assert.equal(
            messages.findLast((message) => message.role === 'tool').content,
            '입력 후 화면',
          );
          return call('browser_click', { target: 'e2' });
        }
        assert.equal(
          messages.findLast((message) => message.role === 'tool').content,
          '검색 결과 화면',
        );
        return call('report_completion', { success: true });
      },
      callTool: async (name) => (name === 'browser_type' ? '입력 후 화면' : '검색 결과 화면'),
    }),
  );
  assert.deepEqual(result, { termination: 'model_finished', modelClaim: true, actions: 2 });
  assert.deepEqual(
    decisions.map((entry) => entry.previousToolResults),
    [0, 1, 2],
  );
});

test('알 수 없는 MCP 통신 오류와 금지된 접근을 구분한다', async () => {
  await assert.rejects(
    runAgent(
      input({
        chat: async () => call('browser_click', { target: 'e1' }),
        callTool: async () => {
          throw new Error('MCP failed');
        },
      }),
    ),
    (error) => error.reason === 'tool_error',
  );
  await assert.rejects(
    runAgent(
      input({
        chat: async () => call('browser_navigate', { url: 'https://example.com/' }),
        callTool: async () => {
          throw new Error('호출되면 안 됨');
        },
      }),
    ),
    (error) => error.reason === 'forbidden_access',
  );
});

test('최대 도구 호출 횟수에 도달하면 다음 행동을 실행하지 않는다', async () => {
  let requests = 0;
  const result = await runAgent(
    input({
      maxActions: 2,
      chat: async () => {
        requests += 1;
        return call('browser_snapshot', {});
      },
      callTool: async () => '가상 화면',
    }),
  );
  assert.equal(result.termination, 'action_limit');
  assert.equal(result.actions, 2);
  assert.equal(requests, 2);
});

test('도구 없이 말로만 답하면 한 번만 재안내하고 자기 판정을 기다린다', async () => {
  let requests = 0;
  const result = await runAgent(
    input({
      chat: async (messages) => {
        requests += 1;
        if (requests === 1) return { role: 'assistant', content: '진행하겠습니다.' };
        assert.match(messages.at(-1).content, /도구를 호출/);
        return call('report_completion', { success: false });
      },
      callTool: async () => {
        throw new Error('호출되면 안 됨');
      },
    }),
  );
  assert.equal(requests, 2);
  assert.equal(result.modelClaim, false);
  assert.equal(result.termination, 'model_finished');
});

test('여러 도구를 동시에 요청하면 아무 행동도 실행하지 않고 한 번 재안내한다', async () => {
  let requests = 0;
  let actions = 0;
  const result = await runAgent(
    input({
      chat: async (messages) => {
        requests += 1;
        if (requests === 1)
          return {
            role: 'assistant',
            content: '',
            tool_calls: [
              { function: { name: 'browser_type', arguments: { target: 'e1', text: '가상역' } } },
              { function: { name: 'browser_click', arguments: { target: 'e2' } } },
            ],
          };
        if (requests === 2) {
          assert.equal(actions, 0);
          assert.match(messages.at(-1).content, /아무 도구도 실행되지 않았습니다/);
          return call('browser_type', { target: 'e1', text: '가상역' });
        }
        return call('report_completion', { success: false });
      },
      callTool: async () => {
        actions += 1;
        return '가상 화면';
      },
    }),
  );
  assert.equal(actions, 1);
  assert.equal(result.actions, 3);
  assert.equal(result.termination, 'model_finished');
});

test('잘못된 인자는 실행하지 않고 올바른 인자로 다시 선택할 기회를 준다', async () => {
  let requests = 0;
  let actions = 0;
  const stats = { rejectedToolCalls: 0 };
  const result = await runAgent(
    input({
      stats,
      chat: async (messages) => {
        requests += 1;
        if (requests === 1) return call('browser_click', { element: '버튼' });
        if (requests === 2) {
          assert.equal(actions, 0);
          assert.match(messages.at(-1).content, /도구를 실행하지 않았습니다/);
          return call('browser_click', { target: 'e1' });
        }
        return call('report_completion', { success: false });
      },
      callTool: async () => {
        actions += 1;
        return '가상 화면';
      },
    }),
  );
  assert.equal(stats.rejectedToolCalls, 1);
  assert.equal(actions, 1);
  assert.equal(result.actions, 2);
  assert.equal(result.termination, 'model_finished');
});

// 대역은 MCP 오류와 스냅샷만 제공하며 후속 도구는 모델 역할이 직접 고른다.
test('복구 가능한 오류를 전달받은 모델이 다음 행동을 선택하고 성공하면 연속 오류를 초기화한다', async () => {
  let turn = 0;
  const stats = {};
  const recoveries = [];
  const result = await runAgent(
    input({
      stats,
      maxConsecutiveErrors: 2,
      onRecovery: (event) => recoveries.push(event),
      chat: async (messages) => {
        turn += 1;
        if (turn === 1) return call('browser_type', { target: '없는 대상', text: '가상역' });
        if (turn === 2) {
          const feedback = messages.findLast((message) => message.role === 'tool').content;
          assert.match(feedback, /대상을 찾지 못함/);
          assert.match(feedback, /현재 화면:\n.*textbox/);
          return call('browser_type', { target: '새 참조', text: '가상역' });
        }
        return call('report_completion', { success: true });
      },
      callTool: async (_name, args) => {
        if (args.target === '없는 대상')
          throw new RecoverableToolError('대상을 찾지 못함\n\n현재 화면:\ntextbox');
        assert.equal(args.target, '새 참조');
        return '입력 후 화면';
      },
    }),
  );
  assert.equal(result.actions, 2);
  assert.equal(result.modelClaim, true);
  assert.equal(stats.recoverableErrors, 1);
  assert.equal(stats.recoveryAttempts, 1);
  assert.equal(stats.recoveredActions, 1);
  assert.equal(stats.consecutiveErrors, 0);
  assert.deepEqual(
    recoveries.map((event) => event.status),
    ['feedback', 'action_succeeded'],
  );
});

test('연속 오류와 행동 제한에 실패한 호출도 포함하고 제한 뒤에는 재시도하지 않는다', async () => {
  let requests = 0;
  const stats = {};
  const events = [];
  await assert.rejects(
    runAgent(
      input({
        stats,
        maxConsecutiveErrors: 2,
        onRecovery: (event) => events.push(event),
        chat: async () => {
          requests += 1;
          return call('browser_click', { target: '없는 참조' });
        },
        callTool: async () => {
          throw new RecoverableToolError('실패\n\n현재 화면:\n화면');
        },
      }),
    ),
    (error) => error.reason === 'consecutive_error_limit',
  );
  assert.equal(requests, 2);
  assert.equal(stats.actions, 2);
  assert.equal(stats.recoverableErrors, 2);
  assert.equal(stats.recoveryAttempts, 1);
  assert.equal(stats.recoveredActions, 0);
  assert.equal(events.at(-1).delivered, false);

  let afterLimit = 0;
  const limitedStats = {};
  const limited = await runAgent(
    input({
      stats: limitedStats,
      maxActions: 1,
      chat: async () => {
        afterLimit += 1;
        return call('browser_click', { target: '없는 참조' });
      },
      callTool: async () => {
        throw new RecoverableToolError('실패\n\n현재 화면:\n화면');
      },
    }),
  );
  assert.equal(limited.termination, 'action_limit');
  assert.equal(limitedStats.actions, 1);
  assert.equal(limitedStats.recoveryAttempts, 0);
  assert.equal(afterLimit, 1);

  let invalidRequests = 0;
  const invalid = await runAgent(
    input({
      maxActions: 1,
      chat: async () => {
        invalidRequests += 1;
        return call('browser_click', { element: '대상 누락' });
      },
      callTool: async () => {
        throw new Error('실행되면 안 됨');
      },
    }),
  );
  assert.equal(invalid.termination, 'action_limit');
  assert.equal(invalid.actions, 1);
  assert.equal(invalidRequests, 1);
});

test('세션 종료와 도구 시간 초과는 복구하지 않고 금지된 도구는 실행하지 않는다', async () => {
  for (const reason of ['browser_disconnected', 'mcp_disconnected', 'tool_timeout']) {
    let calls = 0;
    await assert.rejects(
      runAgent(
        input({
          chat: async () => call('browser_click', { target: '대상' }),
          callTool: async () => {
            calls += 1;
            throw new EvaluationError(reason, '복구 불가');
          },
        }),
      ),
      (error) => error.reason === reason,
    );
    assert.equal(calls, 1);
  }
  for (const forbidden of [
    call('browser_evaluate', { code: '1 + 1' }),
    call('browser_navigate', { url: 'https://example.com/' }),
    call('browser_navigate', { url: 'https://example.com/', unexpected: true }),
  ]) {
    let calls = 0;
    await assert.rejects(
      runAgent(
        input({
          chat: async () => forbidden,
          callTool: async () => {
            calls += 1;
          },
        }),
      ),
      (error) => ['forbidden_tool', 'forbidden_access'].includes(error.reason),
    );
    assert.equal(calls, 0);
  }
  let calls = 0;
  const stats = {};
  await assert.rejects(
    runAgent(
      input({
        stats,
        chat: async () => ({
          tool_calls: [
            { function: { name: 'browser_evaluate', arguments: { code: '1 + 1' } } },
            { function: { name: 'browser_click', arguments: { target: '대상' } } },
          ],
        }),
        callTool: async () => {
          calls += 1;
        },
      }),
    ),
    (error) => error.reason === 'forbidden_tool',
  );
  assert.equal(calls, 0);
  assert.equal(stats.actions, 2);
});

test('MCP 실패 분류는 세션·시간·접근 오류와 일반 요소 오류를 구분한다', () => {
  assert.equal(
    classifyMcpFailure('Target page, context or browser has been closed'),
    'browser_disconnected',
  );
  assert.equal(classifyMcpFailure('', { mcpClosed: true }), 'mcp_disconnected');
  assert.equal(classifyMcpFailure('Error: Timeout 2000ms exceeded'), 'tool_timeout');
  assert.equal(classifyMcpFailure('Error: Access denied'), 'forbidden_access');
  assert.equal(classifyMcpFailure('Error: This action is not permitted'), 'forbidden_access');
  assert.equal(classifyMcpFailure('Error: "timeout" does not match any elements.'), null);
  assert.equal(classifyMcpFailure('Error: "Access denied" does not match any elements.'), null);
  assert.equal(
    classifyMcpFailure('Error: "browser has been closed" does not match any elements.'),
    null,
  );
});
