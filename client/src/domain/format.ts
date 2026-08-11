/** 화면 표시용 문자열 포맷. */

import type { ConfirmedVisitCondition, FeeCalculationStatus } from './types';
import { seoulParts } from './time';

export const formatFee = (fee: number | null, status: FeeCalculationStatus | 'NOT_REQUESTED') => {
  if (status === 'UNAVAILABLE' || fee === null) return '요금 계산 불가';
  return fee === 0 ? '무료' : `${new Intl.NumberFormat('ko-KR').format(fee)}원`;
};

export const formatDistance = (meters: number) => (meters < 1_000 ? `${meters}m` : `${(meters / 1_000).toFixed(1)}km`);

export const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
};

export const formatVisit = ({ entryAt, exitAt }: ConfirmedVisitCondition) => {
  const entry = new Date(entryAt);
  const exit = new Date(exitAt);
  const start = seoulParts(entry);
  const end = seoulParts(exit);
  const dateLabel = `${Number(start.date.slice(5, 7))}월 ${Number(start.date.slice(8, 10))}일`;
  return start.date === end.date
    ? `${dateLabel} ${start.time}–${end.time}`
    : `${dateLabel} ${start.time}–다음 날 ${end.time}`;
};

export const formatCheckedAt = (value: string) => {
  const { date, time } = seoulParts(new Date(value));
  return `${date.replaceAll('-', '.')} ${time} 기준`;
};

export const formatRecentAt = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
