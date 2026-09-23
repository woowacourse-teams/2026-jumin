import { CompleteParkingPeriod, ParkingPeriod } from '../model/time';

export type PeriodValidation =
  | {
      isValid: true;
      entryTimeError: null;
      period: CompleteParkingPeriod;
    }
  | {
      isValid: false;
      entryTimeError: string | null;
    };

// 입출차 시간 유효성 검증 메서드
export const validatePeriod = (period: ParkingPeriod, now: Date): PeriodValidation => {
  const { entryAt, exitAt } = period;

  // 사용자에게 메시지를 보여줄 유일한 경우
  if (entryAt.getTime() <= now.getTime()) {
    return {
      isValid: false,
      entryTimeError: '입차 시간이 지났어요. 현재 시각 이후로 다시 설정해주세요.',
    };
  }

  // 아래부터는 버튼만 비활성화
  if (exitAt === null) {
    return {
      isValid: false,
      entryTimeError: null,
    };
  }

  const durationMs = exitAt.getTime() - entryAt.getTime();

  if (durationMs <= 0 || durationMs > 24 * 60 * 60 * 1000) {
    return {
      isValid: false,
      entryTimeError: null,
    };
  }

  return {
    isValid: true,
    entryTimeError: null,
    period: {
      entryAt,
      exitAt,
    },
  };
};
