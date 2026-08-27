import { queryOptions } from '@tanstack/react-query';

import { searchParkingLots } from '../parkingLots';
import { ParkingSearchQueryKeyParams } from '../../shared/types/queryKeys';

export const parkingSearchQueryOptions = (key: ParkingSearchQueryKeyParams) =>
  queryOptions({
    queryKey: [
      'parking-lots',
      'search',
      {
        destinationLatitude: key.destinationLatitude,
        destinationLongitude: key.destinationLongitude,
        entryAt: key.entryAt,
        exitAt: key.exitAt,
      },
    ],

    queryFn: ({ signal }) =>
      searchParkingLots(
        {
          destinationLatitude: key.destinationLatitude,
          destinationLongitude: key.destinationLongitude,
          entryAt: key.entryAt,
          exitAt: key.exitAt,
        },
        signal,
      ),

    staleTime: 60 * 1000,
    retry: 1,
  });
