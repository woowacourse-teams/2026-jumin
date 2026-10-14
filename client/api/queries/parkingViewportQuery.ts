import { queryOptions } from '@tanstack/react-query';
import { getParkingLotsInViewport } from '../parkingLots';
import type {
  ParkingViewportFilters,
  ParkingViewportQueryParams,
} from '../../shared/types/queryKeys';
import { normalizeViewport } from '../../src/pages/HomePage/utils/normalizeViewport';

export const parkingViewportQueryOptions = (
  viewport: ParkingViewportQueryParams,
  filters?: ParkingViewportFilters,
) => {
  const normalizedViewport = normalizeViewport(viewport);
  const activeFilters = filters ?? {
    freeOnly: viewport.freeOnly ?? false,
    excludeMechanical: viewport.excludeMechanical ?? false,
  };

  return queryOptions({
    // 같은 영역이어도 필터가 다르면 별도 응답을 캐시한다.
    queryKey: ['parking-lots', 'viewport', normalizedViewport, activeFilters],

    queryFn: ({ signal }) =>
      getParkingLotsInViewport({ ...normalizedViewport, ...activeFilters }, signal),

    meta: {
      feature: 'parking-map',
      operation: 'get-parking-lots-in-viewport',
    },

    staleTime: 30 * 1000,
    retry: 1,
  });
};
