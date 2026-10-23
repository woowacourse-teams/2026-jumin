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

// 필터 동작을 확인할 수 있도록 목 응답에만 필터 기준을 부여한다.
export const parkingViewportFilterMetadata = parkingViewportLots.reduce<
  Record<number, { isFreeToday: boolean; isMechanical: boolean; isPublic: boolean | null }>
>((metadata, { id }, index) => {
  metadata[id] = {
    isFreeToday: index % 4 === 0,
    isMechanical: index % 3 === 0,
    isPublic: index % 5 === 0 ? null : index % 2 === 0,
  };
  return metadata;
}, {});
