import { getParkingLotDetail, searchParkingLots } from '../../src/api/parkingLots';
import { gangnamStationParkingLots } from '../../mocks/fixtures/gangnamStationParkingLots';
import { searchCondition } from '../testData';

const movedDestination = {
  destinationLatitude: 37.52,
  destinationLongitude: 127.05,
};

const homeLocations = new Map(
  gangnamStationParkingLots.map(({ id, latitude, longitude }) => [id, { latitude, longitude }]),
);

describe('홈 지도의 실제 주차장으로 만든 추천 mock', () => {
  it('강남역 목적지에는 홈 지도와 같은 좌표의 주차장을 가까운 순으로 최대 15곳 추천한다', async () => {
    const response = await searchParkingLots(searchCondition);
    const distances = response.parkingLots.map(({ distanceMeters }) => distanceMeters!);

    expect(response.totalCount).toBe(response.parkingLots.length);
    expect(response.parkingLots).toHaveLength(15);
    expect(distances).toEqual([...distances].sort((first, second) => first - second));
    expect(Math.max(...distances)).toBeLessThanOrEqual(response.searchRadiusMeters);

    for (const { id, location } of response.parkingLots) {
      expect(location).toEqual(homeLocations.get(id));
    }
  });

  it('주변에 실제 주차장이 없는 목적지에는 같은 주차장을 목적지 주변으로 옮겨 추천한다', async () => {
    const response = await searchParkingLots({ ...searchCondition, ...movedDestination });

    expect(response.parkingLots.length).toBeGreaterThan(0);
    for (const { distanceMeters } of response.parkingLots) {
      expect(distanceMeters).toBeLessThanOrEqual(response.searchRadiusMeters);
    }
  });

  it('추천과 상세에서 같은 주차장 좌표·거리·요금을 반환한다', async () => {
    const condition = { ...searchCondition, ...movedDestination };
    const recommendation = await searchParkingLots(condition);
    const details = await Promise.all(
      recommendation.parkingLots.map(({ id }) => getParkingLotDetail(id, condition)),
    );

    expect(
      details.map(({ location, distanceMeters, estimatedFee }) => ({
        location,
        distanceMeters,
        estimatedFee,
      })),
    ).toEqual(
      recommendation.parkingLots.map(({ location, distanceMeters, estimatedFee }) => ({
        location,
        distanceMeters,
        estimatedFee,
      })),
    );
  });

  it('빈 결과 시나리오를 유지한다', async () => {
    window.history.replaceState({}, '', '/?mock=parking-empty');

    await expect(searchParkingLots({ ...searchCondition, ...movedDestination })).resolves.toEqual({
      searchRadiusMeters: 600,
      totalCount: 0,
      parkingLots: [],
    });
  });
});
