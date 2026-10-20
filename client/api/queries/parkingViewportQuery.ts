import { queryOptions } from '@tanstack/react-query';
import { getParkingLotsInViewport } from '../parkingLots';
import type {
  ParkingViewportFilters,
  ParkingViewportQueryParams,
} from '../../shared/types/queryKeys';
import { normalizeViewport } from '../../src/pages/HomePage/utils/normalizeViewport';
import { parkingKeys } from './parkingKeys';

export const parkingViewportQueryOptions = (
  viewport: ParkingViewportQueryParams,
  filters?: ParkingViewportFilters,
) => {
  const normalizedViewport = normalizeViewport(viewport);
  const request = {
    ...normalizedViewport,
    freeOnly: filters?.freeOnly ?? viewport.freeOnly ?? false,
    excludeMechanical: filters?.excludeMechanical ?? viewport.excludeMechanical ?? false,
  };

  return queryOptions({
    // 같은 영역이어도 필터가 다르면 별도 응답을 캐시한다.
    queryKey: parkingKeys.viewport(request),

    queryFn: ({ signal }) => getParkingLotsInViewport(request, signal),

    meta: {
      feature: 'parking-map',
      operation: 'get-parking-lots-in-viewport',
    },

    staleTime: 30 * 1000,
    retry: 1,
  });
};
