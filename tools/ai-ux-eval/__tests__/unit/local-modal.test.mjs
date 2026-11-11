import assert from 'node:assert/strict';
import test from 'node:test';
import { inputTargetSignature, modalTargetScope } from '../../local-modal.mjs';

// 모달이 열린 동안 가려진 입력이 성공한 것처럼 기록되는 회귀를 막는다.
test('유일하게 식별된 대화상자의 안팎만 구분한다', () => {
  const snapshot = [
    '- generic:',
    '  - textbox "배경" [ref=f1e1]',
    '  - dialog "일반 안내" [ref=f1e2]:',
    '    - paragraph: 안내',
    '    - button "확인" [ref=f1e3]',
    '  - button "배경 버튼" [ref=f1e4]',
  ].join('\n');
  const modal = { role: 'dialog', label: '일반 안내' };
  assert.equal(modalTargetScope(snapshot, modal, 'f1e1'), 'outside');
  assert.equal(modalTargetScope(snapshot, modal, 'f1e2'), 'inside');
  assert.equal(modalTargetScope(snapshot, modal, 'f1e3'), 'inside');
  assert.equal(modalTargetScope(snapshot, modal, 'f1e4'), 'outside');
  assert.equal(modalTargetScope(snapshot, modal, 'missing'), 'unavailable');
  assert.equal(modalTargetScope(snapshot, null, 'f1e1'), 'unavailable');
  assert.equal(
    modalTargetScope(`${snapshot}\n  - button [ref=f1e3]`, modal, 'f1e3'),
    'unavailable',
  );
  assert.equal(
    modalTargetScope(`${snapshot}\n  - dialog "일반 안내":`, modal, 'f1e1'),
    'unavailable',
  );
});

// 클릭 후 같은 입력란인지 모호하면 이전 참조로 내용을 채우지 않는다.
test('유일한 텍스트 입력 참조만 포커스 대상으로 인식한다', () => {
  const before = '- textbox "검색" [ref=f1e1]';
  assert.equal(inputTargetSignature(before, 'f1e1'), 'textbox:"검색"');
  assert.equal(inputTargetSignature('- button "검색" [ref=f1e1]', 'f1e1'), null);
  assert.equal(inputTargetSignature(`${before}\n${before}`, 'f1e1'), null);
  assert.equal(inputTargetSignature(`${before} [ref=f1e1]`, 'f1e1'), null);
  assert.equal(inputTargetSignature(before, 'unknown'), null);
});
