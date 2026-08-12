/**
 * 화면이 의존하는 유일한 API 계약.
 * 백엔드가 준비되면 이 인터페이스를 만족하는 구현만 갈아끼우면 된다.
 */

import type {
  Coordinate,
  DestinationSearchResponse,
  DetailSearchCondition,
  ParkingLotDetailResponse,
  ParkingSearchRequest,
  ParkingSearchResponse,
} from '../domain';

export interface ParkingApi {
  searchDestinations(
    query: string,
    currentLocation?: Coordinate,
    signal?: AbortSignal,
  ): Promise<DestinationSearchResponse>;
  searchParkingLots(request: ParkingSearchRequest, signal?: AbortSignal): Promise<ParkingSearchResponse>;
  getParkingLot(
    parkingLotId: string,
    condition?: DetailSearchCondition,
    signal?: AbortSignal,
  ): Promise<ParkingLotDetailResponse>;
}
