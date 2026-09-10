import { jest } from '@jest/globals';

import { destinationFixtures } from '../mocks/fixtures/destinations';
import { parkingDetailFixtures } from '../mocks/fixtures/parkingDetails';
import type { ParkingDetailCondition, ParkingSearchCondition } from '../shared/types/navigation';

export const destination = destinationFixtures[0]!;
export const recommendedParkingLot = parkingDetailFixtures[101]!;

export const searchCondition: ParkingSearchCondition = {
  destinationName: destination.name,
  destinationLatitude: destination.latitude,
  destinationLongitude: destination.longitude,
  entryAt: '2099-09-02T10:00:00+09:00',
  exitAt: '2099-09-02T11:00:00+09:00',
};

export const createDetailCondition = (parkingLotId = 101): ParkingDetailCondition => {
  const parkingLot = parkingDetailFixtures[parkingLotId];

  if (!parkingLot) {
    throw new Error(`통합 테스트용 주차장 상세 fixture가 없습니다: ${parkingLotId}`);
  }

  return {
    parkingLotId,
    parkingLotName: parkingLot.name,
    ...searchCondition,
  };
};

export const setMockScenario = (scenario: string) => {
  window.history.replaceState({}, '', `/?mock=${scenario}`);
};

export const mockGeolocation = (latitude = 37.4981, longitude = 127.0279) => {
  const getCurrentPosition = jest.fn<Geolocation['getCurrentPosition']>((success) => {
    queueMicrotask(() => {
      const coords: GeolocationCoordinates = {
        latitude,
        longitude,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: () => ({ latitude, longitude }),
      };

      success({
        coords,
        timestamp: Date.now(),
        toJSON: () => ({ coords: coords.toJSON() }),
      });
    });
  });

  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  });

  return getCurrentPosition;
};
