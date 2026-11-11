import assert from 'node:assert/strict';
import test from 'node:test';
import { compactLocalMessages } from '../../local-context.mjs';

// 이전 화면을 제외하되 최신 화면과 직전 도구 결과, 과제·관점·행동은 유지한다.
test('이전 스냅샷 누적 없이 마지막 도구 결과와 현재 화면을 전달한다', () => {
  const initial = '가상 이전 화면',
    current = '가상 현재 화면';
  const messages = [
    { role: 'system', content: '시스템' },
    { role: 'user', content: `공통 과제: 목표\n우선 관점: 가격\n\n현재 화면:\n${initial}` },
    {
      role: 'assistant',
      content: '추론 내용',
      tool_calls: [{ function: { name: 'browser_click', arguments: { target: 'e1' } } }],
    },
    { role: 'tool', tool_name: 'browser_click', content: `성공 현재 화면:\n${current}` },
    { role: 'user', content: '다음 행동' },
  ];
  const compact = compactLocalMessages(
    messages,
    current,
    [{ tool: 'browser_click', target: 'other_button', outcome: 'success' }],
    [{ tool: 'browser_click' }],
  );
  const output = JSON.stringify(compact);
  assert.doesNotMatch(output, /가상 이전 화면|추론 내용/);
  assert.match(output, /공통 과제: 목표|우선 관점: 가격/);
  assert.equal(output.split(current).length - 1, 1);
  assert.match(output, /other_button|success/);
  assert.equal(compact.find((x) => x.role === 'tool').content, `성공 현재 화면:\n${current}`);
  assert.equal(compact.find((x) => x.role === 'assistant').content, '');
});

test('도구 인자 오류 결과에 화면이 없으면 최신 화면을 별도로 유지한다', () => {
  const messages = [
    { role: 'system', content: 's' },
    { role: 'user', content: '과제\n\n현재 화면:\n오래된 화면' },
    { role: 'assistant', tool_calls: [{ function: { name: 'browser_click' } }] },
    { role: 'tool', content: '실행되지 않음' },
  ];
  const compact = compactLocalMessages(messages, '새 화면', [], []);
  assert.match(JSON.stringify(compact), /새 화면/);
  assert.doesNotMatch(JSON.stringify(compact), /오래된 화면/);
});

// 화면이 길더라도 모델에 주는 후보 목록을 임의로 줄이지 않는다.
test('큰 최신 화면도 원형 그대로 포함하고 한 번만 전달한다', () => {
  const screen = Array.from({ length: 200 }, (_, i) => `candidate-${i}`).join('\n');
  const messages = [
    { role: 'system', content: 's' },
    { role: 'user', content: '과제\n\n현재 화면:\n과거' },
    { role: 'assistant', tool_calls: [{ function: { name: 'browser_snapshot' } }] },
    { role: 'tool', content: `현재 화면:\n${screen}` },
  ];
  const compact = compactLocalMessages(messages, screen, [], []);
  const combined = JSON.stringify(compact);
  assert.equal(combined.split('candidate-199').length - 1, 1);
  assert.ok(compact.find((message) => message.role === 'tool').content.includes(screen));
});
