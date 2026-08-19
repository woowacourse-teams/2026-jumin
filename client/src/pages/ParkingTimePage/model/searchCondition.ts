import type { TimeValue } from './time';

const pad = (value: number) => String(value).padStart(2, '0');

const formatOffsetDateTime = (date: Date) =>
  [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00+09:00`,
  ].join('');

export const createSearchPeriod = (date: Date, entryTime: TimeValue, exitTime: TimeValue) => {
  const entryAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), entryTime.hour, entryTime.minute);

  const exitAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), exitTime.hour, exitTime.minute);

  // 23:30 입차, 00:30 출차처럼 자정을 넘는 경우
  if (exitAt <= entryAt) {
    exitAt.setDate(exitAt.getDate() + 1);
  }

  return {
    entryAt: formatOffsetDateTime(entryAt),
    exitAt: formatOffsetDateTime(exitAt),
  };
};
