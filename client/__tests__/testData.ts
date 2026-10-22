import { destinationFixtures } from '../mocks/fixtures/destinations';
import type { ParkingSearchCondition } from '../shared/types/navigation';

const destination = destinationFixtures[0]!;

export const searchCondition: ParkingSearchCondition = {
  destinationName: destination.name,
  destinationLatitude: destination.latitude,
  destinationLongitude: destination.longitude,
  entryAt: '2099-09-02T10:00:00+09:00',
  exitAt: '2099-09-02T11:00:00+09:00',
};
