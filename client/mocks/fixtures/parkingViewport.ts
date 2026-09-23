import type { ParkingLotViewport } from '../../api/contracts';
import { parkingSearchSuccess } from './parkingSearch';
import { viewportParkingLotDetailFixtures } from './viewportParkingLotDetails';

export const parkingViewportLots: ParkingLotViewport[] = parkingSearchSuccess.parkingLots
  .filter(({ id }) => viewportParkingLotDetailFixtures[id] !== undefined)
  .map(({ id, location }) => ({
    id,
    latitude: location.latitude,
    longitude: location.longitude,
  }));
