/** 방문 시간(입·출차) 규칙. */

import type { ConfirmedVisitCondition, VisitDraft } from './types';
import { addDays, minuteOfDay, nextTenMinuteSlot, seoulParts, toIsoAtSeoul } from './time';

export const deriveVisit = (draft: VisitDraft): ConfirmedVisitCondition | null => {
  if (!draft.entryTime || !draft.exitTime) return null;
  const exitDate =
    minuteOfDay(draft.exitTime) > minuteOfDay(draft.entryTime) ? draft.visitDate : addDays(draft.visitDate, 1);
  const entryAt = toIsoAtSeoul(draft.visitDate, draft.entryTime);
  const exitAt = toIsoAtSeoul(exitDate, draft.exitTime);
  return { entryAt, exitAt, durationMinutes: (Date.parse(exitAt) - Date.parse(entryAt)) / 60_000 };
};

export const initialNearbyVisit = (now = new Date()): VisitDraft => {
  const entry = nextTenMinuteSlot(now);
  const exit = seoulParts(new Date(Date.parse(toIsoAtSeoul(entry.date, entry.time)) + 60 * 60_000));
  return {
    source: 'NEARBY',
    visitDate: entry.date,
    entryTime: entry.time,
    exitTime: exit.time,
    nearbyExitWasEdited: false,
  };
};

export type VisitValidation = { field: 'entryAt' | 'exitAt' | 'timeRange'; message: string } | null;

export const validateVisit = (draft: VisitDraft, now = new Date()): VisitValidation => {
  if (!draft.entryTime || !draft.exitTime)
    return { field: !draft.entryTime ? 'entryAt' : 'exitAt', message: '입차 시간과 출차 시간을 모두 선택해주세요.' };
  if (minuteOfDay(draft.entryTime) % 10 || minuteOfDay(draft.exitTime) % 10)
    return { field: 'timeRange', message: '10분 단위의 시간을 선택해주세요.' };
  const visit = deriveVisit(draft);
  if (!visit || Date.parse(visit.entryAt) <= now.getTime())
    return { field: 'entryAt', message: '현재 이후의 입차 시간을 선택해주세요.' };
  if (visit.durationMinutes < 10 || visit.durationMinutes > 1_440)
    return { field: 'timeRange', message: '출차 시간은 입차 시간보다 늦어야 해요.' };
  return null;
};

export const addVisitMinutes = (draft: VisitDraft, amount: number): VisitDraft | null => {
  if (!draft.entryTime) return null;
  const entryAt = toIsoAtSeoul(draft.visitDate, draft.entryTime);
  const current = deriveVisit(draft);
  const base = current?.exitAt ?? entryAt;
  const exit = new Date(Date.parse(base) + amount * 60_000);
  if ((exit.getTime() - Date.parse(entryAt)) / 60_000 > 1_440) return null;
  return {
    ...draft,
    exitTime: seoulParts(exit).time,
    nearbyExitWasEdited: draft.source === 'NEARBY' || draft.nearbyExitWasEdited,
  };
};

export const syncVisitFromResponse = (draft: VisitDraft, confirmed: ConfirmedVisitCondition): VisitDraft => ({
  ...draft,
  visitDate: confirmed.entryAt.slice(0, 10),
  entryTime: confirmed.entryAt.slice(11, 16),
  exitTime: confirmed.exitAt.slice(11, 16),
});

export const refreshNearbyVisit = (draft: VisitDraft, now = new Date()): VisitDraft => {
  const current = deriveVisit(draft);
  if (!current || Date.parse(current.entryAt) > now.getTime()) return draft;
  const next = nextTenMinuteSlot(now);
  if (!draft.nearbyExitWasEdited) {
    const exit = seoulParts(new Date(Date.parse(toIsoAtSeoul(next.date, next.time)) + 60 * 60_000));
    return { ...draft, visitDate: next.date, entryTime: next.time, exitTime: exit.time };
  }
  return { ...draft, visitDate: next.date, entryTime: next.time };
};
