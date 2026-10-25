import { getParkingLotDetail, searchParkingLots } from '../../api/parkingLots';
import { parkingSearchSuccess } from '../../mocks/fixtures/parkingSearch';
import { searchCondition } from '../testData';

const movedDestination = {
  destinationLatitude: 37.52,
  destinationLongitude: 127.05,
};

describe('목적지에 따른 추천 mock 좌표', () => {
  it.each([
    { ...movedDestination, expectedLatitude: 37.5209, expectedLongitude: 127.0511 },
    {
      destinationLatitude: 35.1796,
      destinationLongitude: 129.0756,
      expectedLatitude: 35.1805,
      expectedLongitude: 129.0767,
    },
  ])(
    '목적지 $destinationLatitude, $destinationLongitude 주변에 주차장을 배치한다',
    async ({ destinationLatitude, destinationLongitude, expectedLatitude, expectedLongitude }) => {
      const response = await searchParkingLots({
        ...searchCondition,
        destinationLatitude,
        destinationLongitude,
      });
      const parkingLot = response.parkingLots.find(({ id }) => id === 101);

      expect(response.totalCount).toBe(response.parkingLots.length);
      expect(parkingLot?.location.latitude).toBeCloseTo(expectedLatitude, 6);
      expect(parkingLot?.location.longitude).toBeCloseTo(expectedLongitude, 6);
    },
  );

  it('추천과 상세에서 같은 주차장 좌표를 반환한다', async () => {
    const condition = { ...searchCondition, ...movedDestination };
    const recommendation = await searchParkingLots(condition);
    const details = await Promise.all(
      recommendation.parkingLots.map(({ id }) => getParkingLotDetail(id, condition)),
    );

    expect(details.map(({ location }) => location)).toEqual(
      recommendation.parkingLots.map(({ location }) => location),
    );
  });

  it('다른 목적지 조회 후에도 기본 목적지의 주차장 좌표를 유지한다', async () => {
    await searchParkingLots({ ...searchCondition, ...movedDestination });
    const response = await searchParkingLots(searchCondition);

    expect(response).toEqual(parkingSearchSuccess);
    const detail = await getParkingLotDetail(101, searchCondition);
    expect(detail.location).toEqual({ latitude: 37.499, longitude: 127.029 });
  });

  it('빈 결과 시나리오를 유지한다', async () => {
    window.history.replaceState({}, '', '/?mock=parking-empty');

    await expect(searchParkingLots({ ...searchCondition, ...movedDestination })).resolves.toEqual({
      ...parkingSearchSuccess,
      totalCount: 0,
      parkingLots: [],
    });
  });
});
