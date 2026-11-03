import { queryOptions } from '@tanstack/react-query';
import { getViewportParkingLotDetail } from '../parkingLots';
import { parkingKeys } from './parkingKeys';

export const viewportParkingLotDetailQueryOptions = (parkingLotId: number) => {
  return queryOptions({
    queryKey: parkingKeys.viewportDetail(parkingLotId),
    queryFn: ({ signal }) => getViewportParkingLotDetail(parkingLotId, signal),

    meta: {
      feature: 'parking-map',
      operation: 'get-viewport-parking-lot-detail',
    },

    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
};
