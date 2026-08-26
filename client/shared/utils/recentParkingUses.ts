import type { AvailabilityStatus, ParkingLotSummary } from '../../api/contracts';

const RECENT_PARKING_USES_KEY = 'recentParkingUses';
const MAX_RECENT_PARKING_USES = 20;
const availabilityStatuses: AvailabilityStatus[] = ['AVAILABLE', 'UNAVAILABLE', 'UNKNOWN'];

export interface RecentParkingUse {
  parkingLot: ParkingLotSummary;
  usedAt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isNullableNumber = (value: unknown): value is number | null => value === null || typeof value === 'number';

const isParkingLotSummary = (value: unknown): value is ParkingLotSummary => {
  if (!isRecord(value) || !isRecord(value.location)) return false;

  return (
    typeof value.id === 'number' &&
    typeof value.name === 'string' &&
    typeof value.address === 'string' &&
    typeof value.location.latitude === 'number' &&
    typeof value.location.longitude === 'number' &&
    typeof value.distanceMeters === 'number' &&
    isNullableNumber(value.estimatedFee) &&
    isNullableNumber(value.balancedScore) &&
    typeof value.availabilityStatus === 'string' &&
    availabilityStatuses.includes(value.availabilityStatus as AvailabilityStatus)
  );
};

const isRecentParkingUse = (value: unknown): value is RecentParkingUse =>
  isRecord(value) &&
  isParkingLotSummary(value.parkingLot) &&
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

export const saveRecentParkingUse = (parkingLot: ParkingLotSummary, usedAt = new Date()) => {
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
