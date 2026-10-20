// client/api/queries/parkingDetailQuery.ts

import { queryOptions } from '@tanstack/react-query';

import { getParkingLotDetail, type ParkingDetailParams } from '../parkingLots';
import type { ParkingDetailQueryKeyParams } from '../../shared/types/queryKeys';
import { parkingKeys } from './parkingKeys';

export const parkingDetailQueryOptions = ({
  parkingLotId,
  condition,
}: ParkingDetailQueryKeyParams) => {
  const request: ParkingDetailParams = {
    destinationLatitude: condition.destinationLatitude,
    destinationLongitude: condition.destinationLongitude,
    entryAt: condition.entryAt,
    exitAt: condition.exitAt,
  };
  return queryOptions({
    queryKey: parkingKeys.detail(parkingLotId, request),

    queryFn: ({ signal }) => getParkingLotDetail(parkingLotId, request, signal),

    meta: {
      feature: 'parking-detail',
      operation: 'get-parking-lot-detail',
    },

    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
};
