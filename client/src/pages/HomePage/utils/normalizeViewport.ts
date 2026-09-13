import { ParkingViewportParams } from '../../../../api/parkingLots';

/** 좌표값을 소수점 4자리까지 만들기 위한 상수값 */
const VIEWPORT_PRECISION = 10_000;

const floorCoordinate = (value: number) =>
  Math.floor(value * VIEWPORT_PRECISION) / VIEWPORT_PRECISION;

const ceilCoordinate = (value: number) =>
  Math.ceil(value * VIEWPORT_PRECISION) / VIEWPORT_PRECISION;

/** 뷰포트를 정규화하는 메서드 */
export const normalizeViewport = (viewport: ParkingViewportParams): ParkingViewportParams => ({
  // 조회 영역이 실제 화면보다 작아지지 않게 바깥 방향으로 정규화
  southLatitude: floorCoordinate(viewport.southLatitude),
  westLongitude: floorCoordinate(viewport.westLongitude),
  northLatitude: ceilCoordinate(viewport.northLatitude),
  eastLongitude: ceilCoordinate(viewport.eastLongitude),
});
