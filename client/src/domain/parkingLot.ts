/** 주차장 정렬과 표시 라벨. 순위는 백엔드가 계산하며 여기서 다시 매기지 않는다. */

import type { OperationStatus, ParkingLotSummary, SortCategory } from './types';

const rankFor = (lot: ParkingLotSummary, category: SortCategory) =>
  category === 'DISTANCE'
    ? lot.sortRanks.distance
    : category === 'PRICE'
      ? lot.sortRanks.price
      : lot.sortRanks.balanced;

/**
 * 해당 정렬 기준의 rank가 있는지. 백엔드는 요금 계산 불가면 `price`를,
 * 요금 계산 불가이거나 운영 불가면 `balanced`를 null로 준다.
 */
export const isSortableBy = (lot: ParkingLotSummary, category: SortCategory) => rankFor(lot, category) !== null;

export const sortParkingLots = (lots: ParkingLotSummary[], category: SortCategory) =>
  [...lots].sort((a, b) => {
    const left = rankFor(a, category);
    const right = rankFor(b, category);
    if (left !== null && right === null) return -1;
    if (left === null && right !== null) return 1;
    if (left !== null && right !== null && left !== right) return left - right;
    return a.sortRanks.distance - b.sortRanks.distance || a.parkingLotId.localeCompare(b.parkingLotId);
  });

export const recommendationLabel = (category: SortCategory) =>
  ({ DISTANCE: '거리 우선', PRICE: '가격 우선', BALANCED: '균형' })[category];

export const operationLabel = (status: OperationStatus | 'NOT_REQUESTED') =>
  ({ AVAILABLE: '이용 가능', UNAVAILABLE: '운영 불가', UNKNOWN: '운영 확인 필요', NOT_REQUESTED: '운영 정보' })[status];
