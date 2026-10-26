import type { ParkingLotSummary } from '../../api/contracts';

type Coordinates = ParkingLotSummary['location'];

const FIXTURE_DESTINATION: Coordinates = {
  latitude: 37.4981,
  longitude: 127.0279,
};

/** 기존 fixture의 상대 배치를 유지해 요청 목적지 주변으로 옮긴다. */
export const relocateParkingLocation = (
  location: Coordinates,
  destination: Coordinates,
): Coordinates => ({
  latitude: location.latitude + (destination.latitude - FIXTURE_DESTINATION.latitude),
  longitude: location.longitude + (destination.longitude - FIXTURE_DESTINATION.longitude),
});
