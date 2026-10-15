import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ParkingViewportFilters } from '../../../../api/parkingLots';
import { parkingViewportQueryOptions } from '../../../../api/queries/parkingViewportQuery';
import type { MapViewport } from './useMapViewport';
import { getParkingRequestViewport } from '../utils/getParkingRequestViewport';

export const useViewportParkingLots = (viewport: MapViewport, filters: ParkingViewportFilters) =>
  useQuery({
    ...parkingViewportQueryOptions(getParkingRequestViewport(viewport), filters),
    // 뷰포트가 바뀌는 동안 기존 마커를 유지해 지도 깜빡임을 줄인다.
    placeholderData: keepPreviousData,
  });
