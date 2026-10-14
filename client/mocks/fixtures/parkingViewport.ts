import type { ParkingLotViewport } from '../../api/contracts';
import { gangnamStationParkingLots } from './gangnamStationParkingLots';
import { parkingSearchSuccess } from './parkingSearch';
import { viewportParkingLotDetailFixtures } from './viewportParkingLotDetails';

const viewportLocations = [
  ...parkingSearchSuccess.parkingLots.map(({ id, location }) => ({
    id,
    latitude: location.latitude,
    longitude: location.longitude,
  })),
  ...gangnamStationParkingLots.map(({ id, latitude, longitude }) => ({ id, latitude, longitude })),
];

export const parkingViewportLots: ParkingLotViewport[] = viewportLocations.map(
  ({ id, latitude, longitude }) => {
    const capacity = viewportParkingLotDetailFixtures[id]?.capacity;

    return {
      id,
      latitude,
      longitude,
      // LOD 목 응답도 서버의 capacity 점수 규칙을 따른다.
      score: typeof capacity === 'number' && capacity > 0 ? capacity / (capacity + 50) : 0,
    };
  },
);
