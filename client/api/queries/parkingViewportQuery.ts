import { queryOptions } from '@tanstack/react-query';
import { getParkingLotsInViewport } from '../parkingLots';
import { ParkingViewportQueryKeyParams } from '../../shared/types/queryKeys';

export const parkingViewportQueryOptions = (key: ParkingViewportQueryKeyParams) =>
  queryOptions({
    queryKey: [
      'parking-lots',
      'viewport',
      {
        southLatitude: key.southLatitude,
        westLongitude: key.westLongitude,
        northLatitude: key.northLatitude,
        eastLongitude: key.eastLongitude,
      },
    ],
    queryFn: ({ signal }) =>
      getParkingLotsInViewport(
        {
          southLatitude: key.southLatitude,
          westLongitude: key.westLongitude,
          northLatitude: key.northLatitude,
          eastLongitude: key.eastLongitude,
        },
        signal,
      ),
    staleTime: 30 * 1000,
    retry: 1,
  });
