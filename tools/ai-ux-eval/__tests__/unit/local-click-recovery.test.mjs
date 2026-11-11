import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyMcpFailure, McpToolError } from '../../evaluation.mjs';
import {
  classifyLocalClickTarget,
  classifyLocalActionContext,
  isConfirmedClickTimeout,
  localMcpArguments,
  LOCAL_ACTION_TIMEOUT_MS,
  validateLocalVerification,
} from '../../local-smoke.mjs';

// 원문을 저장하지 않고 확실한 모달만 기록하며, 모순된 증거는 미확인으로 남긴다.
test('행동 시점의 모달을 안전한 범주로 분류한다', () => {
  assert.equal(
    classifyLocalActionContext('- dialog "서비스 이용 경험 설문" [ref=e1]'),
    'survey_modal',
  );
  assert.equal(
    classifyLocalActionContext('- dialog "어떤 앱으로 갈까요?" [ref=e2]'),
    'directions_modal',
  );
  assert.equal(classifyLocalActionContext('- button "서비스 이용 경험 설문"'), 'unavailable');
  assert.equal(
    classifyLocalActionContext('- dialog "서비스 이용 경험 설문"\n- dialog "어떤 앱으로 갈까요?"'),
    'unavailable',
  );
});

test('유일한 접근성 참조만 고정된 클릭 대상으로 분류한다', () => {
  const snap =
    '- button "서비스 이용 경험 설문 닫기" [ref=f1e1]\n- textbox "목적지 검색" [ref=f1e2]\n- button "기타" [ref=f1e3]\n- button "3일간 보지 않기" [ref=f1e4]\n- textbox "임의" [ref=f1e5]\n- link "임의" [ref=f1e6]\n- paragraph [ref=f1e7]';
  assert.equal(classifyLocalClickTarget(snap, 'f1e1'), 'survey_close');
  assert.equal(classifyLocalClickTarget(snap, 'f1e2'), 'search_input');
  assert.equal(classifyLocalClickTarget(snap, 'f1e3'), 'other_button');
  assert.equal(classifyLocalClickTarget(snap, 'f1e4'), 'survey_hide_three_days');
  assert.equal(classifyLocalClickTarget(snap, 'f1e5'), 'other_input');
  assert.equal(classifyLocalClickTarget(snap, 'f1e6'), 'other_link');
  assert.equal(classifyLocalClickTarget(snap, 'f1e7'), 'unavailable');
  assert.equal(
    classifyLocalClickTarget(`${snap}\n- button "다른 항목" [ref=f1e1]`, 'f1e1'),
    'unavailable',
  );
  assert.equal(classifyLocalClickTarget(snap, '#selector'), 'unavailable');
  assert.equal(classifyLocalClickTarget(snap, 'f1e9'), 'unavailable');
});

test('독립 판정의 화면 증거가 모순되면 성공으로 받아들이지 않는다', () => {
  const value = {
    verification: 'passed',
    verificationReason: 'search_screen_observed',
    analyticsOptOut: true,
    mapSdkAvailable: true,
    searchInputVisible: null,
    searchInputPresent: null,
    surveyDialogVisible: null,
  };
  assert.throws(() => validateLocalVerification(value));
  assert.equal(
    validateLocalVerification({
      ...value,
      verification: 'unavailable',
      verificationReason: 'insufficient_evidence',
    }).searchInputVisible,
    null,
  );
});

test('MCP 클릭 단계의 명시적 locator 클릭 시간 초과만 확인된 클릭 시간 초과다', () => {
  const click = new McpToolError('TimeoutError: locator.click: Timeout 5000ms exceeded.');
  assert.equal(isConfirmedClickTimeout('browser_click', 'action', click), true);
  assert.equal(isConfirmedClickTimeout('browser_type', 'action', click), false);
  assert.equal(isConfirmedClickTimeout('browser_click', 'snapshot', click), false);
  assert.equal(
    isConfirmedClickTimeout(
      'browser_click',
      'action',
      new McpToolError('Timeout 5000ms exceeded.'),
    ),
    false,
  );
  assert.equal(isConfirmedClickTimeout('browser_click', 'action', new Error(click.text)), false);
  const wrapped = new McpToolError(
    '### Error\nTimeoutError: browserBackend.callTool: Timeout 5000ms exceeded.\nCall log:\n  - attempting click action',
  );
  assert.equal(isConfirmedClickTimeout('browser_click', 'action', wrapped), true);
  assert.equal(
    isConfirmedClickTimeout(
      'browser_click',
      'action',
      new McpToolError(
        `${wrapped.text}\n  - click action done\n  - waiting for scheduled navigations to finish`,
      ),
    ),
    false,
  );
  assert.equal(
    isConfirmedClickTimeout(
      'browser_click',
      'action',
      new McpToolError('TimeoutError: browserBackend.callTool: Timeout 5000ms exceeded.'),
    ),
    false,
  );
  assert.ok(localMcpArguments('cli', 'endpoint', 'output').includes('--timeout-action=5000'));
  assert.equal(LOCAL_ACTION_TIMEOUT_MS, 5000);
  assert.equal(classifyMcpFailure(wrapped.text, { browserClosed: true }), 'browser_disconnected');
  assert.equal(classifyMcpFailure(wrapped.text, { mcpClosed: true }), 'mcp_disconnected');
});
