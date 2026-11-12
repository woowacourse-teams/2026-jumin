import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeActionReference, summarizeInitialScreen } from '../../local-screen-evidence.mjs';

// 스냅샷의 계층과 참조를 범주화하되 화면 내용과 참조값은 결과로 반환하지 않는다.
test('설문 안팎과 조작 상태를 중복 참조 및 미확인과 구분한다', () => {
  const screen =
    '- generic\n  - textbox "사적인 입력" [ref=f1e1]\n  - dialog "서비스 이용 경험 설문"\n    - button "서비스 이용 경험 설문 닫기" [ref=f1e2]\n    - textbox "비밀" [disabled] [ref=f1e3]\n    - iframe "서비스 이용 경험 설문지"';
  const initial = summarizeInitialScreen(screen);
  assert.deepEqual(initial, {
    surveyModal: true,
    surveyClose: true,
    surveyFrame: true,
    surveyFrameContent: 'not_observed',
    refCount: 3,
    firstRequestContainsSnapshot: null,
    firstPromptTokens: null,
  });
  assert.deepEqual(summarizeActionReference(screen, 'f1e1'), {
    reference: 'unique',
    location: 'outside_survey_modal',
    state: 'not_marked_disabled',
  });
  assert.deepEqual(summarizeActionReference(screen, 'f1e2'), {
    reference: 'unique',
    location: 'inside_survey_modal',
    state: 'not_marked_disabled',
  });
  assert.equal(summarizeActionReference(screen, 'f1e3').state, 'disabled');
  assert.equal(
    summarizeActionReference(screen + '\n  - button [ref=f1e2]', 'f1e2').reference,
    'ambiguous',
  );
  assert.equal(summarizeActionReference(screen, 'unknown').reference, 'not_found');
  assert.equal(summarizeActionReference(screen, '#secret').reference, 'unavailable');
  assert.doesNotMatch(
    JSON.stringify([initial, summarizeActionReference(screen, 'f1e3')]),
    /사적인|비밀|f1e/,
  );
});
