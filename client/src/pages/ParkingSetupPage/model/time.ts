// 입출차 시간 상태 관리를 위한 인터페이스
export interface ParkingPeriod {
  entryAt: Date;
  exitAt: Date | null;
}

export interface CompleteParkingPeriod {
  entryAt: Date;
  exitAt: Date;
}

// 입차: 현재 시간을 기준으로 가장 가까운 10분 단위의 날짜(시간 포함)를 반환, 출차는 null로 초기화
export const createRoundedCurrentDate = (now = new Date()): ParkingPeriod => {
  const roundedDate = new Date(now);
  const minutesUntilNextSlot = 10 - (roundedDate.getMinutes() % 10);

  roundedDate.setMinutes(roundedDate.getMinutes() + minutesUntilNextSlot, 0, 0);

  return {
    entryAt: roundedDate,
    exitAt: null,
  };
};
