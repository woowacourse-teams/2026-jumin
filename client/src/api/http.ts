/** 실제 백엔드 구현. 경로와 query 이름은 docs/backend-api-contract.md 를 따른다. */

import {
  parseDestinationSearchResponse,
  parseParkingDetailResponse,
  parseParkingSearchResponse,
  type Coordinate,
  type DetailSearchCondition,
  type ParkingSearchRequest,
} from '../domain';
import { getJson, withContractError } from './client';
import { ApiClientError } from './errors';
import type { ParkingApi } from './types';

export const httpApi: ParkingApi = {
  async searchDestinations(query: string, currentLocation?: Coordinate, signal?: AbortSignal) {
    const normalized = query.trim();
    const params = new URLSearchParams({ query: normalized });
    if (currentLocation) {
      params.set('currentLatitude', String(currentLocation.latitude));
      params.set('currentLongitude', String(currentLocation.longitude));
    }
    const value = await getJson('/api/destinations/search', params, signal);
    const response = withContractError(() => parseDestinationSearchResponse(value));
    if (response.query !== normalized) throw new ApiClientError('CONTRACT', 'CONTRACT_ERROR');
    return response;
  },

  async searchParkingLots(request: ParkingSearchRequest, signal?: AbortSignal) {
    const params = new URLSearchParams({
      destinationLatitude: String(request.destinationLatitude),
      destinationLongitude: String(request.destinationLongitude),
      entryAt: request.entryAt,
      exitAt: request.exitAt,
    });
    if (request.destinationName) params.set('destinationName', request.destinationName);
    const value = await getJson('/api/parking-lots/search', params, signal);
    return withContractError(() => parseParkingSearchResponse(value, request));
  },

  async getParkingLot(parkingLotId: string, condition?: DetailSearchCondition, signal?: AbortSignal) {
    const params = new URLSearchParams();
    if (condition) {
      params.set('destinationLatitude', String(condition.destinationLatitude));
      params.set('destinationLongitude', String(condition.destinationLongitude));
      params.set('entryAt', condition.entryAt);
      params.set('exitAt', condition.exitAt);
    }
    const value = await getJson(`/api/parking-lots/${encodeURIComponent(parkingLotId)}`, params, signal);
    return withContractError(() => parseParkingDetailResponse(value, parkingLotId));
  },
};
