import type { ParkingLotSummary } from '../../../../api/contracts';
import type { RecommendationType } from '../types/recommendation';

export const getSortValue = (parkingLot: ParkingLotSummary, type: RecommendationType) => {
  switch (type) {
    case 'DISTANCE':
      return parkingLot.distanceMeters;

    case 'PRICE':
      return parkingLot.estimatedFee;

    case 'BALANCED':
      return parkingLot.balancedScore;
  }
};

export const sortParkingLots = (parkingLots: ParkingLotSummary[], type: RecommendationType) =>
  [...parkingLots].sort((first, second) => {
    const firstValue = getSortValue(first, type) ?? Number.POSITIVE_INFINITY;
    const secondValue = getSortValue(second, type) ?? Number.POSITIVE_INFINITY;

    const firstDistance = first.distanceMeters ?? Number.POSITIVE_INFINITY;
    const secondDistance = second.distanceMeters ?? Number.POSITIVE_INFINITY;

    return firstValue - secondValue || firstDistance - secondDistance || first.id - second.id;
  });

export const getRecommendationMessage = (type: RecommendationType, rank: number) => {
  if (type === 'PRICE') {
    return rank === 1 ? '설정한 조건에서 제일 저렴해요' : `가격이 ${rank}번째로 저렴해요`;
  }

  if (type === 'DISTANCE') {
    return rank === 1 ? '목적지에서 가장 가까워요' : `목적지에서 ${rank}번째로 가까워요`;
  }

  return `거리와 가격의 균형 ${rank}위예요`;
};
