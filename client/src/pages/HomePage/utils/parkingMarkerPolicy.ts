import type { ParkingLotViewport } from '../../../../api/contracts';

export const REPRESENTATIVE_ZOOM = 15;
export const REPRESENTATIVE_COUNT = 10;

// 기준 줌에서는 점수가 높은 주차장을 대표 마커로 고정해 표시한다.
export const getRepresentativeParkingLotIds = (
  parkingLots: readonly ParkingLotViewport[],
  zoom: number,
): Set<number> | null => {
  if (zoom !== REPRESENTATIVE_ZOOM) return null;

  return new Set(
    [...parkingLots]
      .sort((first, second) => second.score - first.score || first.id - second.id)
      .slice(0, REPRESENTATIVE_COUNT)
      .map(({ id }) => id),
  );
};
