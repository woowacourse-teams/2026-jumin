import type { Coordinates } from '../../../../shared/types/coordinates';

/** 셋업페이지에서 사용하는 목적지 데이터 인터페이스 */
export interface SetupDestination extends Coordinates {
  name?: string;
  address?: string;
}
