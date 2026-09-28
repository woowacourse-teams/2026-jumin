import { queryOptions } from '@tanstack/react-query';
import { getParkingLotsInViewport } from '../parkingLots';
import { ParkingViewportQueryKeyParams } from '../../shared/types/queryKeys';
import { normalizeViewport } from '../../src/pages/HomePage/utils/normalizeViewport';

export const parkingViewportQueryOptions = (viewport: ParkingViewportQueryKeyParams) => {
  const normalizedViewport = normalizeViewport(viewport);

  return queryOptions({
    queryKey: ['parking-lots', 'viewport', normalizedViewport],

    queryFn: ({ signal }) => getParkingLotsInViewport(normalizedViewport, signal),

    meta: {
      feature: 'parking-map',
      operation: 'get-parking-lots-in-viewport',
    },

    staleTime: 30 * 1000,
    retry: 1,
  });
};
