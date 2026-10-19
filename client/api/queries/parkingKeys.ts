import type {
  ParkingDetailParams,
  ParkingSearchParams,
  ParkingViewportRequestParams,
} from '../parkingLots';

export const parkingKeys = {
  all: ['parking-lots'] as const,

  viewport: (params: ParkingViewportRequestParams) =>
    [
      'parking-lots',
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
    ['parking-lots', 'viewport-detail', parkingLotId] as const,

  detail: (parkingLotId: number, condition: ParkingDetailParams) =>
    [
      'parking-lots',
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
      'parking-lots',
      'search',
      {
        destinationLatitude: params.destinationLatitude,
        destinationLongitude: params.destinationLongitude,
        entryAt: params.entryAt,
        exitAt: params.exitAt,
      },
    ] as const,
};
