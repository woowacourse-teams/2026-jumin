import type { ParkingLotViewport } from '../../api/contracts';
import { parkingSearchSuccess } from './parkingSearch';

export const parkingViewportLots: ParkingLotViewport[] = parkingSearchSuccess.parkingLots.map(
  ({ id, location }) => ({
    id,
    latitude: location.latitude,
    longitude: location.longitude,
  }),
);
