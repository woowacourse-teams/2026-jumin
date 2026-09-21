import { differenceInMinutes, isBefore, startOfMinute } from 'date-fns';
import { CompleteParkingPeriod, ParkingPeriod } from '../model/time';

// 입출차 시간 유효성 검증 메서드
export const validatePeriod = (period: ParkingPeriod): period is CompleteParkingPeriod => {
  const { entryAt, exitAt } = period;

  if (exitAt === null) {
    return false;
  }

  const durationMinutes = differenceInMinutes(exitAt, entryAt);

  return entryAt.getTime() > Date.now() && durationMinutes > 0 && durationMinutes <= 24 * 60;
};

/** 입차 시간 검증 실패 + 에러를 보여주기 위한 검증 메서드 */
export const getEntryTimeError = (entryAt: Date, now: Date): string | null => {
  const currentMinute = startOfMinute(now);

  if (isBefore(entryAt, currentMinute))
    return '입차 시간이 지났어요. 현재 시각 이후로 다시 설정해주세요.';

  return null;
};
