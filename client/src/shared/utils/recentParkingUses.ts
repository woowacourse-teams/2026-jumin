import type { ParkingLotDetailResponse } from '../../api/contracts';

const RECENT_PARKING_USES_KEY = 'recentParkingUses';
const MAX_RECENT_PARKING_USES = 20;

export type RecentParkingLot = Pick<
  ParkingLotDetailResponse,
  'id' | 'name' | 'address' | 'location'
>;

export interface RecentParkingUse {
  parkingLot: RecentParkingLot;
  usedAt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isRecentParkingLot = (value: unknown): value is RecentParkingLot => {
  if (!isRecord(value) || !isRecord(value.location)) return false;

  return (
    typeof value.id === 'number' &&
    typeof value.name === 'string' &&
    typeof value.address === 'string' &&
    typeof value.location.latitude === 'number' &&
    typeof value.location.longitude === 'number'
  );
};

const isRecentParkingUse = (value: unknown): value is RecentParkingUse =>
  isRecord(value) &&
  isRecentParkingLot(value.parkingLot) &&
  typeof value.usedAt === 'string' &&
  !Number.isNaN(Date.parse(value.usedAt));

export const loadRecentParkingUses = (): RecentParkingUse[] => {
  try {
    const storedValue = localStorage.getItem(RECENT_PARKING_USES_KEY);
    if (!storedValue) return [];

    const parsedValue: unknown = JSON.parse(storedValue);
    if (!Array.isArray(parsedValue)) return [];

    return parsedValue.filter(isRecentParkingUse);
  } catch {
    return [];
  }
};

export const saveRecentParkingUse = (parkingLot: RecentParkingLot, usedAt = new Date()) => {
  try {
    const nextRecentParkingUses = [
      { parkingLot, usedAt: usedAt.toISOString() },
      ...loadRecentParkingUses().filter((recentUse) => recentUse.parkingLot.id !== parkingLot.id),
    ].slice(0, MAX_RECENT_PARKING_USES);

    localStorage.setItem(RECENT_PARKING_USES_KEY, JSON.stringify(nextRecentParkingUses));
  } catch {
    // 최근 이용 기록 저장 실패가 길찾기 실행을 막지 않도록 한다.
  }
};
