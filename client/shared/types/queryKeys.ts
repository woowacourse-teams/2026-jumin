import {
  ParkingDetailParams,
  ParkingSearchParams,
  ParkingViewportParams,
} from '../../api/parkingLots';

export interface DestinationSearchQueryKeyParams {
  readonly query: string;
}

export type ParkingSearchQueryKeyParams = Readonly<ParkingSearchParams>;

export interface ParkingDetailQueryKeyParams {
  readonly parkingLotId: number;
  readonly condition: Readonly<ParkingDetailParams>;
}

export type ParkingViewportQueryKeyParams = Readonly<ParkingViewportParams>;
