import type {
  ParkingDetailParams,
  ParkingSearchParams,
  ParkingViewportRequestParams,
} from '../parkingLots';

const parkingRoot = ['parking-lots'] as const;

export const parkingKeys = {
  viewport: (params: ParkingViewportRequestParams) =>
    [
      ...parkingRoot,
      'viewport',
      {
        southLatitude: params.southLatitude,
        westLongitude: params.westLongitude,
        northLatitude: params.northLatitude,
        eastLongitude: params.eastLongitude,
        freeOnly: params.freeOnly ?? false,
        excludeMechanical: params.excludeMechanical ?? false,
      },
    ] as const,

  viewportDetail: (parkingLotId: number) =>
    [...parkingRoot, 'viewport-detail', parkingLotId] as const,

  detail: (parkingLotId: number, condition: ParkingDetailParams) =>
    [
      ...parkingRoot,
      'detail',
      parkingLotId,
      {
        destinationLatitude: condition.destinationLatitude,
        destinationLongitude: condition.destinationLongitude,
        entryAt: condition.entryAt,
        exitAt: condition.exitAt,
      },
    ] as const,

  search: (params: ParkingSearchParams) =>
    [
      ...parkingRoot,
      'search',
      {
        destinationLatitude: params.destinationLatitude,
        destinationLongitude: params.destinationLongitude,
        entryAt: params.entryAt,
        exitAt: params.exitAt,
      },
    ] as const,
};
