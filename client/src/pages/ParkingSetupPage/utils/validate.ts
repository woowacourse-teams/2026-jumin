import { differenceInMinutes } from 'date-fns';
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
