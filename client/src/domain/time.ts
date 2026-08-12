/** 서울 시간대 기준 날짜·시각 계산. */

const SEOUL_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export const seoulParts = (date: Date) => {
  const parts = Object.fromEntries(SEOUL_FORMATTER.formatToParts(date).map(({ type, value }) => [type, value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
};

export const todayInSeoul = (now = new Date()) => seoulParts(now).date;

export const nextTenMinuteSlot = (now = new Date()) => {
  const next = new Date(Math.floor(now.getTime() / 600_000) * 600_000 + 600_000);
  return seoulParts(next);
};

export const addDays = (date: string, amount: number) => {
  const value = new Date(`${date}T12:00:00+09:00`);
  value.setUTCDate(value.getUTCDate() + amount);
  return seoulParts(value).date;
};

export const toIsoAtSeoul = (date: string, time: string) => `${date}T${time}:00+09:00`;

export const minuteOfDay = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

const parseYearMonth = (yearMonth: string) => {
  const [year = 0, month = 1] = yearMonth.split('-').map(Number);
  return { year, month };
};

/** 'YYYY-MM-DD' 에서 'YYYY-MM' 만 떼어낸다. */
export const yearMonthOf = (date: string) => date.slice(0, 7);

/** 'YYYY-MM' 을 amount 개월만큼 옮긴다. */
export const shiftMonth = (yearMonth: string, amount: number) => {
  const { year, month } = parseYearMonth(yearMonth);
  const moved = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${moved.getUTCFullYear()}-${String(moved.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * 달력 격자에 놓을 날짜들. 첫 주의 빈칸은 null 이다.
 * 표준시 영향을 받지 않도록 UTC 로만 계산한다.
 */
export const monthGrid = (yearMonth: string): (string | null)[] => {
  const { year, month } = parseYearMonth(yearMonth);
  const lead = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= lastDay; day += 1) cells.push(`${yearMonth}-${String(day).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

/** '2026-08' → '2026년 8월' */
export const formatYearMonth = (yearMonth: string) => {
  const { year, month } = parseYearMonth(yearMonth);
  return `${year}년 ${month}월`;
};
