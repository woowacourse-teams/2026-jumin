import { ParkingDetailParams, ParkingSearchParams } from '../../api/parkingLots';

export interface DestinationSearchQueryKeyParams {
  readonly query: string;
}

export type ParkingSearchQueryKeyParams = Readonly<ParkingSearchParams>;

export interface ParkingDetailQueryKeyParams {
  readonly parkingLotId: number;
  readonly condition: Readonly<ParkingDetailParams>;
}
