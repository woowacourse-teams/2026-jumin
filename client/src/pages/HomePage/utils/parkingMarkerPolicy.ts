import type { ParkingLotViewport } from '../../../api/contracts';

export const REPRESENTATIVE_ZOOM = 15;
export const REPRESENTATIVE_COUNT = 10;

// 기준 줌에서는 점수 상위 10개와 좋아요한 주차장을 모두 큰 마커로 표시한다.
export const getRepresentativeParkingLotIds = (
  parkingLots: readonly ParkingLotViewport[],
  zoom: number,
): Set<number> | null => {
  if (zoom !== REPRESENTATIVE_ZOOM) return null;

  const representativeIds = [...parkingLots]
    .sort((first, second) => second.score - first.score || first.id - second.id)
    .slice(0, REPRESENTATIVE_COUNT)
    .map(({ id }) => id);
  const likedIds = parkingLots.filter(({ likedByMe }) => likedByMe).map(({ id }) => id);

  return new Set([...representativeIds, ...likedIds]);
};
