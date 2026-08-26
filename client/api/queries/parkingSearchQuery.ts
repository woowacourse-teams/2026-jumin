// api/queries/parkingSearchQuery.ts

import { queryOptions } from '@tanstack/react-query';

import { searchParkingLots } from '../parkingLots';
import { ParkingSearchCondition } from '../../shared/types/parkingSearch';

export const parkingSearchQueryOptions = (condition: ParkingSearchCondition) =>
  queryOptions({
    queryKey: [
      'parking-lots',
      'search',
      {
        destinationLatitude: condition.destinationLatitude,
        destinationLongitude: condition.destinationLongitude,
        entryAt: condition.entryAt,
        exitAt: condition.exitAt,
      },
    ],

    queryFn: ({ signal }) =>
      searchParkingLots(
        {
          destinationLatitude: condition.destinationLatitude,
          destinationLongitude: condition.destinationLongitude,
          entryAt: condition.entryAt,
          exitAt: condition.exitAt,
        },
        signal,
      ),

    staleTime: 60 * 1000,
    retry: 1,
  });
