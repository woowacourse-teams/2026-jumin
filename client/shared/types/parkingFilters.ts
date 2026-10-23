/** 화면과 조회 방식에 독립적인 주차장 필터 조건. */
export interface ParkingFilters {
  freeOnly: boolean;
  excludeMechanical: boolean;
}
