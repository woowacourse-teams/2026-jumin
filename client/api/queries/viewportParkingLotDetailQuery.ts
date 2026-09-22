import { queryOptions } from '@tanstack/react-query';
import { getViewportParkingLotDetail } from '../parkingLots';

export const viewportParkingLotDetailQueryOptions = (parkingLotId: number) =>
  queryOptions({
    queryKey: ['parking-lots', 'viewport-detail', parkingLotId],
    queryFn: ({ signal }) => getViewportParkingLotDetail(parkingLotId, signal),

    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
