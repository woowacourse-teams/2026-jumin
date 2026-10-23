import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getRepresentativeParkingLotIds,
  REPRESENTATIVE_COUNT,
  REPRESENTATIVE_ZOOM,
} from '../../../src/pages/HomePage/utils/parkingMarkerPolicy.ts';

const parkingLots = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  score: index === 11 ? 0.9 : index / 10,
}));

test('기준 줌에서는 점수가 높은 주차장 10개를 대표 주차장으로 선택한다', () => {
  const ids = getRepresentativeParkingLotIds(parkingLots, REPRESENTATIVE_ZOOM);

  assert.equal(ids?.size, REPRESENTATIVE_COUNT);
  assert.equal(ids?.has(12), true);
  assert.equal(ids?.has(1), false);
  assert.equal(ids?.has(3), true);
});

test('기준 줌이 아니면 모든 주차장을 대표 주차장으로 취급한다', () => {
  assert.equal(getRepresentativeParkingLotIds(parkingLots, REPRESENTATIVE_ZOOM + 1), null);
});
