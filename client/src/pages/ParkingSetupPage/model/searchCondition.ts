import { format, isEqual } from 'date-fns';
import type { TimeValue } from './time';

const formatOffsetDateTime = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm:ss'+09:00'");

// TimeValue 인터페이스의 값을 Date 객체로 변환해서 예외처리 후, string으로 포맷해서 전달
export const createSearchPeriod = (date: Date, entryTime: TimeValue, exitTime: TimeValue) => {
  const entryAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), entryTime.hour, entryTime.minute);

  const exitAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), exitTime.hour, exitTime.minute);

  // 입차, 출차 시간이 같은 경우 예외처리
  if (isEqual(exitAt, entryAt)) {
    throw new Error('입차 시간과 출차 시간은 같을 수 없습니다.');
  }

  // 23:30 입차, 00:30 출차처럼 자정을 넘는 경우
  if (exitAt < entryAt) {
    exitAt.setDate(exitAt.getDate() + 1);
  }

  return {
    entryAt: formatOffsetDateTime(entryAt),
    exitAt: formatOffsetDateTime(exitAt),
  };
};
