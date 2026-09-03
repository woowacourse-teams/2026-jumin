// 입출차 시간 상태 관리를 위한 인터페이스
export interface ParkingPeriod {
  entryAt: Date;
  exitAt: Date | null;
}

export interface CompleteParkingPeriod {
  entryAt: Date;
  exitAt: Date;
}
