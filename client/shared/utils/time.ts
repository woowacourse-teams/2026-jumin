import { format } from 'date-fns';

// 입차: 현재 시간을 기준으로 가장 가까운 10분 단위의 날짜(시간 포함)를 반환, 출차는 null로 초기화

export const createRoundedCurrentDate = (now = new Date()) => {
  const roundedDate = new Date(now);
  const minutesUntilNextSlot = 10 - (roundedDate.getMinutes() % 10);

  roundedDate.setMinutes(roundedDate.getMinutes() + minutesUntilNextSlot, 0, 0);

  return roundedDate;
};

export const formatOffsetDateTime = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm:ss'+09:00'");
