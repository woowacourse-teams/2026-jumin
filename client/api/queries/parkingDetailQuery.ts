// client/api/queries/parkingDetailQuery.ts

import { queryOptions } from '@tanstack/react-query';

import { getParkingLotDetail } from '../parkingLots';
import type { ParkingDetailQueryKeyParams } from '../../shared/types/queryKeys';

export const parkingDetailQueryOptions = (key: ParkingDetailQueryKeyParams) =>
  queryOptions({
    queryKey: [
      'parking-lots',
      'detail',
      key.parkingLotId,
      {
        destinationLatitude: key.condition.destinationLatitude,
        destinationLongitude: key.condition.destinationLongitude,
        entryAt: key.condition.entryAt,
        exitAt: key.condition.exitAt,
      },
    ],

    queryFn: ({ signal }) =>
      getParkingLotDetail(
        key.parkingLotId,
        {
          destinationLatitude: key.condition.destinationLatitude,
          destinationLongitude: key.condition.destinationLongitude,
          entryAt: key.condition.entryAt,
          exitAt: key.condition.exitAt,
        },
        signal,
      ),

    meta: {
      feature: 'parking-detail',
      operation: 'get-parking-lot-detail',
    },

    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
