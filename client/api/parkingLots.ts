import type {
  DestinationNameResponse,
  DestinationSearchResponse,
  ParkingLotDetailResponse,
  ParkingLotViewportResponse,
  ParkingSearchResponse,
  ViewportParkingLotDetailResponse,
} from './contracts';
import {
  destinationNameSchema,
  destinationSearchSchema,
  parkingLotDetailSchema,
  parkingLotViewportResponseSchema,
  parkingSearchSchema,
  viewportParkingLotDetailSchema,
} from './parkingLotsSchema';
import { parseApiResponse } from './parseApiResponse';
import { getGuestId } from '../shared/utils/guestId';
import { request } from './request';

export interface ParkingSearchParams {
  destinationLatitude: number;
  destinationLongitude: number;
  entryAt: string;
  exitAt: string;
}

export interface ParkingDetailParams {
  destinationLatitude: number;
  destinationLongitude: number;
  entryAt: string;
  exitAt: string;
}

export interface ParkingViewportParams {
  southLatitude: number;
  westLongitude: number;
  northLatitude: number;
  eastLongitude: number;
}

export interface ParkingViewportFilters {
  freeOnly: boolean;
  excludeMechanical: boolean;
}

export type ParkingViewportRequestParams = ParkingViewportParams & Partial<ParkingViewportFilters>;

// 목적지를 검색 및 자동완성하는 메서드
export const searchDestinations = async (
  query: string,
  signal?: AbortSignal,
): Promise<DestinationSearchResponse> => {
  const response = await request(`/api/destinations/search?query=${encodeURIComponent(query)}`, {
    signal,
  });

  return parseApiResponse(response, destinationSearchSchema);
};

export const getDestinationName = async (
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<DestinationNameResponse> => {
  const response = await request(
    `/api/destinations/reverse-geocode?latitude=${latitude}&longitude=${longitude}`,
    { signal },
  );

  return parseApiResponse(response, destinationNameSchema);
};

// 주차장 목록을 가져오는 메서드
export async function searchParkingLots(
  params: ParkingSearchParams,
  signal?: AbortSignal,
): Promise<ParkingSearchResponse> {
  const searchParams = new URLSearchParams({
    destinationLatitude: String(params.destinationLatitude),
    destinationLongitude: String(params.destinationLongitude),
    entryAt: params.entryAt,
    exitAt: params.exitAt,
  });

  const response = await request(`/api/parking/search?${searchParams.toString()}`, { signal });

  return parseApiResponse(response, parkingSearchSchema);
}

// 주차장 상세정보를 가져오는 메서드
export async function getParkingLotDetail(
  parkingLotId: number,
  params: ParkingDetailParams,
  signal?: AbortSignal,
): Promise<ParkingLotDetailResponse> {
  const searchParams = new URLSearchParams({
    destinationLatitude: String(params.destinationLatitude),
    destinationLongitude: String(params.destinationLongitude),
    entryAt: params.entryAt,
    exitAt: params.exitAt,
  });

  const response = await request(`/api/parking/${parkingLotId}?${searchParams.toString()}`, {
    signal,
    headers: { 'X-Guest-Id': getGuestId() },
  });

  return parseApiResponse(response, parkingLotDetailSchema);
}

// 현재 뷰포트 내 주차장 목록을 가져오는 메서드
export const getParkingLotsInViewport = async (
  params: ParkingViewportRequestParams,
  signal?: AbortSignal,
): Promise<ParkingLotViewportResponse> => {
  const searchParams = new URLSearchParams({
    southLatitude: String(params.southLatitude),
    westLongitude: String(params.westLongitude),
    northLatitude: String(params.northLatitude),
    eastLongitude: String(params.eastLongitude),
  });

  // 서버의 기본값을 유지해 활성화된 필터만 요청에 포함한다.
  if (params.freeOnly) searchParams.set('freeOnly', 'true');
  if (params.excludeMechanical) searchParams.set('excludeMechanical', 'true');

  const response = await request(`/api/parking/viewport?${searchParams}`, { signal });

  return parseApiResponse(response, parkingLotViewportResponseSchema);
};

// 홈페이지에서 주차장 상세정보를 가져오는 메서드
export async function getViewportParkingLotDetail(
  parkingLotId: number,
  signal?: AbortSignal,
): Promise<ViewportParkingLotDetailResponse> {
  const response = await request(`/api/parking/viewport/${parkingLotId}`, {
    signal,
    headers: { 'X-Guest-Id': getGuestId() },
  });

  return parseApiResponse(response, viewportParkingLotDetailSchema);
}
