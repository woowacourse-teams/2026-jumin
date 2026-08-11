/** mock 구현. 백엔드 없이 전체 흐름을 돌리기 위한 것으로, 실제 구현과 같은 계약을 만족한다. */

import {
  parseDestinationSearchResponse,
  parseParkingDetailResponse,
  parseParkingSearchResponse,
  type Coordinate,
  type DetailSearchCondition,
  type ParkingSearchRequest,
} from '../../domain';
import { ApiClientError } from '../errors';
import type { ParkingApi } from '../types';
import { detailFromLot, makeSearchResponse, mockDelay, MOCK_DESTINATIONS, MOCK_LOTS } from './fixtures';

export const mockApi: ParkingApi = {
  async searchDestinations(query: string, currentLocation?: Coordinate, signal?: AbortSignal) {
    const normalized = query.trim();
    await mockDelay(signal);
    if (normalized === '검색오류') throw new ApiClientError('NETWORK', 'NAVER_DESTINATION_SEARCH_FAILED', 502);
    const special = normalized.includes('없음')
      ? [
          {
            ...MOCK_DESTINATIONS[0]!,
            destinationId: 'mock_empty',
            name: '추천 없음',
            roadAddress: '서울 강남구 테스트로 0',
          },
        ]
      : normalized.includes('오류')
        ? [
            {
              ...MOCK_DESTINATIONS[0]!,
              destinationId: 'mock_error',
              name: 'API 오류',
              roadAddress: '서울 강남구 테스트로 1',
            },
          ]
        : MOCK_DESTINATIONS.filter((item) =>
            `${item.name} ${item.address} ${item.roadAddress ?? ''}`.includes(normalized),
          );
    const destinations = special.map((item) => ({
      ...item,
      distanceFromCurrentLocationMeters: currentLocation ? item.distanceFromCurrentLocationMeters : null,
    }));
    return parseDestinationSearchResponse({ query: normalized, destinations });
  },

  async searchParkingLots(request: ParkingSearchRequest, signal?: AbortSignal) {
    await mockDelay(signal);
    if (request.destinationName?.includes('API 오류')) throw new ApiClientError('SERVER', 'PARKING_SEARCH_FAILED', 500);
    return parseParkingSearchResponse(makeSearchResponse(request), request);
  },

  async getParkingLot(parkingLotId: string, condition?: DetailSearchCondition, signal?: AbortSignal) {
    await mockDelay(signal);
    const lot = MOCK_LOTS.find((item) => item.parkingLotId === parkingLotId);
    if (!lot) throw new ApiClientError('NOT_FOUND', 'PARKING_LOT_NOT_FOUND', 404);
    return parseParkingDetailResponse(detailFromLot(lot, condition), parkingLotId);
  },
};
