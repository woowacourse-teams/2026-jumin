import { queryOptions } from '@tanstack/react-query';

import { DestinationSearchQueryKeyParams } from '../../shared/types/queryKeys';
import { searchDestinations } from '../parkingLots';

export const destinationSearchQueryOptions = (key: DestinationSearchQueryKeyParams) => {
  const normalizedQuery = key.query.trim();

  return queryOptions({
    queryKey: [
      'destinations',
      'search',
      {
        query: normalizedQuery,
      },
    ],

    queryFn: ({ signal }) => searchDestinations(normalizedQuery, signal),

    enabled: normalizedQuery.length >= 2,

    staleTime: 5 * 60 * 1000,
    retry: false,
  });
};
