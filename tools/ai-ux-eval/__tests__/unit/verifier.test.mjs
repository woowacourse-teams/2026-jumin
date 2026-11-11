import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyObservation, assessPreference } from '../../verifier-logic.mjs';
import { validateVerification } from '../../evaluation.mjs';
import { parseOptions } from '../../options.mjs';

const visibleResult = {
  path: '/results',
  destinationKnown: true,
  destination: '가상역',
  searchVisible: false,
  missingVisible: false,
  resultsVisible: true,
  destinationVisible: true,
  listVisible: true,
  statusVisible: true,
  statusText: '아직 선택하지 않았습니다.',
};

// 선호 일치와 실제 선택 완료는 서로 다른 판정이며, 누락된 증거는 실패로 단정하지 않는다.
test('두 가상 주차장 중 어느 곳을 선택해도 공통 과제는 완료다', () => {
  for (const parking of ['가람 주차장', '다온 주차장']) {
    const result = classifyObservation('parking-selection', {
      ...visibleResult,
      statusText: `선택 완료: ${parking}`,
    });
    assert.equal(result.verification, 'passed');
    assert.equal(result.destinationStatus, 'matched');
    assert.equal(result.selectedParking, parking);
  }
});

test('잘못된 목적지와 미선택은 미달, 화면 증거 누락은 판정 불가다', () => {
  const wrong = classifyObservation('parking-selection', {
    ...visibleResult,
    destination: '다른역',
    missingVisible: true,
    resultsVisible: false,
  });
  assert.equal(wrong.verification, 'not_met');
  assert.equal(wrong.verificationReason, 'wrong_destination');
  assert.equal(wrong.destinationStatus, 'mismatch');
  const empty = classifyObservation('parking-selection', {
    ...visibleResult,
    destination: '',
    missingVisible: true,
    resultsVisible: false,
  });
  assert.equal(empty.verification, 'not_met');
  assert.equal(empty.verificationReason, 'destination_not_searched');
  assert.equal(empty.destinationStatus, 'not_searched');
  const unselected = classifyObservation('parking-selection', visibleResult);
  assert.equal(unselected.verification, 'not_met');
  assert.equal(unselected.verificationReason, 'not_selected');
  assert.equal(unselected.selectedParking, null);
  for (const observation of [
    null,
    { ...visibleResult, statusVisible: false },
    { ...visibleResult, statusText: '확인할 수 없는 상태' },
  ]) {
    const result = classifyObservation('parking-selection', observation);
    assert.equal(result.verification, 'unavailable');
    assert.equal(result.verificationReason, 'insufficient_evidence');
  }
});

test('가상 요금·거리의 선호 일치는 공통 완료와 별도로 기록한다', () => {
  for (const [personaId, parking, expected] of [
    ['price', '가람 주차장', 'matched'],
    ['price', '다온 주차장', 'not_matched'],
    ['walking', '다온 주차장', 'matched'],
    ['walking', '가람 주차장', 'not_matched'],
  ]) {
    const { scenario, persona } = parseOptions(
      ['--scenario', 'select-parking', '--persona', personaId],
      {},
    );
    const verification = classifyObservation('parking-selection', {
      ...visibleResult,
      statusText: `선택 완료: ${parking}`,
    });
    assert.equal(verification.verification, 'passed');
    assert.equal(assessPreference(scenario, persona, verification).status, expected);
  }
  const { scenario, persona } = parseOptions(
    ['--scenario', 'select-parking', '--persona', 'baseline'],
    {},
  );
  assert.equal(
    assessPreference(scenario, persona, classifyObservation('parking-selection', visibleResult))
      .status,
    'not_applicable',
  );
});

test('검증 응답의 불필요한 원문을 기록하지 않고 모순된 완료는 거부한다', () => {
  const result = {
    verification: 'passed',
    verificationReason: 'goal_observed',
    destinationStatus: 'matched',
    searchedDestination: '가상역',
    selectedParking: '가람 주차장',
    rawInput: '기록하면 안 되는 가상 원문',
  };
  assert.equal(Object.hasOwn(validateVerification(result, 'parking-selection'), 'rawInput'), false);
  assert.throws(() =>
    validateVerification({ ...result, selectedParking: null }, 'parking-selection'),
  );
  assert.throws(() =>
    validateVerification({ ...result, verificationReason: '임의 원문' }, 'parking-selection'),
  );
});
