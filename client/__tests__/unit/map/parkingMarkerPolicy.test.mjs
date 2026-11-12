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

test('점수 상위 10개를 유지하면서 순위 밖의 좋아요 주차장도 큰 마커에 포함한다', () => {
  // 기존 상위 10개에 들지 못하는 두 주차장에 좋아요한 상황을 재현한다.
  const lots = parkingLots.map((parkingLot) => ({
    ...parkingLot,
    likedByMe: parkingLot.id <= 2,
  }));
  const ids = getRepresentativeParkingLotIds(lots, REPRESENTATIVE_ZOOM);

  assert.equal(ids?.size, 12);
  assert.ok(lots.every(({ id }) => ids.has(id)));
});

test('좋아요한 주차장은 10개를 넘어도 모두 큰 마커에 포함한다', () => {
  const lots = Array.from({ length: REPRESENTATIVE_COUNT + 3 }, (_, index) => ({
    id: index + 1,
    score: index,
    likedByMe: true,
  }));

  const ids = getRepresentativeParkingLotIds(lots, REPRESENTATIVE_ZOOM);

  assert.equal(ids?.size, lots.length);
  assert.ok(lots.every(({ id }) => ids.has(id)));
});

test('순위 밖 주차장의 좋아요를 해제하면 큰 마커 대상에서 빠진다', () => {
  const likedLots = parkingLots.map((parkingLot) => ({
    ...parkingLot,
    likedByMe: parkingLot.id === 1,
  }));
  assert.equal(getRepresentativeParkingLotIds(likedLots, REPRESENTATIVE_ZOOM)?.has(1), true);

  // 좋아요 해제 후에는 점수에 따른 기존 표시 정책으로 돌아간다.
  const unlikedLots = likedLots.map((parkingLot) => ({ ...parkingLot, likedByMe: false }));
  const ids = getRepresentativeParkingLotIds(unlikedLots, REPRESENTATIVE_ZOOM);

  assert.equal(ids?.has(1), false);
  assert.equal(ids?.size, REPRESENTATIVE_COUNT);
});
