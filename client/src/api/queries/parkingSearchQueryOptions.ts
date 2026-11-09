import { queryOptions } from '@tanstack/react-query';

import { searchParkingLots, type ParkingSearchParams } from '../parkingLots';
import type { ParkingSearchQueryKeyParams } from '../../shared/types/queryKeys';
import { parkingKeys } from './parkingKeys';

export const parkingSearchQueryOptions = (params: ParkingSearchQueryKeyParams) => {
  const request: ParkingSearchParams = {
    destinationLatitude: params.destinationLatitude,
    destinationLongitude: params.destinationLongitude,
    entryAt: params.entryAt,
    exitAt: params.exitAt,
  };

  return queryOptions({
    queryKey: parkingKeys.search(request),

    queryFn: ({ signal }) => searchParkingLots(request, signal),

    meta: {
      feature: 'parking-recommendation',
      operation: 'search-parking-lots',
    },

    staleTime: 60 * 1000,
    retry: 1,
  });
};
