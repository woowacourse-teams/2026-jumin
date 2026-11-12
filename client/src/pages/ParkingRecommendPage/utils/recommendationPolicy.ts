import type { ParkingLotSummary } from '../../../api/contracts';
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
