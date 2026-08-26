import assert from 'node:assert/strict';
import test from 'node:test';

import { getParkingMarkerType } from './parkingMarker.ts';

test('선택 여부와 추천 순위에 맞는 마커 유형을 반환한다', () => {
  const recommendedParkingLotIds = [1, 2, 3];

  assert.equal(getParkingMarkerType(1, 1, recommendedParkingLotIds), 'selected');
  assert.equal(getParkingMarkerType(2, 1, recommendedParkingLotIds), 'recommended');
  assert.equal(getParkingMarkerType(4, 1, recommendedParkingLotIds), 'candidate');
});
