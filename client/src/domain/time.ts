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
