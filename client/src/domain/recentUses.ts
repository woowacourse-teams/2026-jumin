/** 최근 이용 주차장 로컬 저장소. */

import type { ParkingTarget, RecentUse } from './types';
import { isCoordinate, isIsoSeoul, isNonEmptyString, isRecord } from './contract';
import { seoulParts } from './time';

const RECENT_KEY = 'parking-people:recent-uses:v1';

const cleanRecentItems = (items: unknown, now = new Date()): RecentUse[] => {
  if (!Array.isArray(items)) return [];
  const cutoff = now.getTime() - 90 * 24 * 60 * 60_000;
  const seen = new Set<string>();
  return items
    .filter(
      (item): item is RecentUse =>
        isRecord(item) &&
        isNonEmptyString(item.parkingLotId) &&
        isNonEmptyString(item.name) &&
        isNonEmptyString(item.address) &&
        isCoordinate(item.location) &&
        isIsoSeoul(item.usedAt) &&
        Date.parse(item.usedAt) >= cutoff,
    )
    .sort((a, b) => Date.parse(b.usedAt) - Date.parse(a.usedAt))
    .filter((item) => !seen.has(item.parkingLotId) && Boolean(seen.add(item.parkingLotId)))
    .slice(0, 20);
};

export const loadRecentUses = (now = new Date()): RecentUse[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? 'null');
    const items = isRecord(parsed) && parsed.version === 1 ? cleanRecentItems(parsed.items, now) : [];
    localStorage.setItem(RECENT_KEY, JSON.stringify({ version: 1, items }));
    return items;
  } catch {
    return [];
  }
};

export const saveRecentUse = (target: ParkingTarget, now = new Date()) => {
  const usedAt = `${seoulParts(now).date}T${seoulParts(now).time}:00+09:00`;
  const items = cleanRecentItems([{ ...target, usedAt }, ...loadRecentUses(now)], now);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify({ version: 1, items }));
  } catch {
    // 최근 이용 저장 실패가 길찾기를 막지 않는다.
  }
};
