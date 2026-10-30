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

// state 없이 진입 가능한 공개 URL 계약을 테스트 픽스처로 구성한다.
export const createRecommendationUrl = (condition: ParkingSearchCondition = searchCondition) => {
  const params = new URLSearchParams({
    lat: String(condition.destinationLatitude),
    lng: String(condition.destinationLongitude),
    name: condition.destinationName,
    entryAt: condition.entryAt,
    exitAt: condition.exitAt,
  });
  return `/parkingRecommend?${params.toString()}`;
};
