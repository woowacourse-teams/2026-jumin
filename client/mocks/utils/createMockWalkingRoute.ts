import type { ParkingLotSummary } from '../../src/api/contracts';

type Coordinates = ParkingLotSummary['location'];

const METERS_PER_LATITUDE_DEGREE = 111_320;

/**
 * 강남역 일대의 격자 도로 방향. 테헤란로는 동쪽에서 북쪽으로 약 21도 기울어 있고,
 * 강남대로는 그와 직각이다. 목 경로를 이 두 방향으로만 꺾어 길을 따라 걷는 모양을 만든다.
 */
const GRID_ANGLE_RADIANS = (21 * Math.PI) / 180;
const ALONG = { x: Math.cos(GRID_ANGLE_RADIANS), y: Math.sin(GRID_ANGLE_RADIANS) };
const ACROSS = { x: -ALONG.y, y: ALONG.x };

/**
 * 주차장에서 목적지까지 걷는 목 경로를 만든다. 좌표는 주차장 → 목적지 순서다.
 *
 * 실제 보행 네트워크가 아니라 격자 도로를 두 번 꺾어 가는 모양만 흉내 낸다.
 * 꺾는 지점은 주차장 id에 따라 달라져 주차장마다 경로가 겹치지 않는다.
 */
export const createMockWalkingRoute = (
  parkingLotId: number,
  parkingLot: Coordinates,
  destination: Coordinates,
): Coordinates[] => {
  const metersPerLongitudeDegree =
    METERS_PER_LATITUDE_DEGREE * Math.cos((destination.latitude * Math.PI) / 180);

  // 주차장을 원점으로 둔 목적지의 위치(m).
  const east = (destination.longitude - parkingLot.longitude) * metersPerLongitudeDegree;
  const north = (destination.latitude - parkingLot.latitude) * METERS_PER_LATITUDE_DEGREE;
  const along = east * ALONG.x + north * ALONG.y;
  const across = east * ACROSS.x + north * ACROSS.y;

  // 첫 구간에서 도로 방향으로 얼마나 간 뒤 꺾을지(30~70%).
  const firstLeg = 0.3 + ((parkingLotId * 37) % 41) / 100;

  const toCoordinates = (alongMeters: number, acrossMeters: number): Coordinates => {
    const x = alongMeters * ALONG.x + acrossMeters * ACROSS.x;
    const y = alongMeters * ALONG.y + acrossMeters * ACROSS.y;

    return {
      latitude: parkingLot.latitude + y / METERS_PER_LATITUDE_DEGREE,
      longitude: parkingLot.longitude + x / metersPerLongitudeDegree,
    };
  };

  return [
    parkingLot,
    toCoordinates(along * firstLeg, 0),
    toCoordinates(along * firstLeg, across),
    destination,
  ];
};
