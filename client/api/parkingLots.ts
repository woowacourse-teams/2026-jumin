import type {
  DestinationNameResponse,
  DestinationSearchResponse,
  ParkingLotDetailResponse,
  ParkingLotViewportResponse,
  ParkingSearchResponse,
  ValidationErrorResponse,
  ViewportParkingLotDetailResponse,
} from './contracts';

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

// 목적지를 검색 및 자동완성하는 메서드
export const searchDestinations = async (
  query: string,
  signal?: AbortSignal,
): Promise<DestinationSearchResponse> => {
  const response = await fetch(`/api/destinations/search?query=${encodeURIComponent(query)}`, {
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);

    throw new Error(error?.message ?? '목적지 검색 결과를 불러오지 못했습니다.');
  }

  return response.json();
};

export const getDestinationName = async (
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<DestinationNameResponse> => {
  const response = await fetch(
    `/api/destinations/reverse-geocode?latitude=${latitude}&longitude=${longitude}`,
    { signal },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => null);

    throw new Error(error?.message ?? '목적지를 다시 설정해주세요.');
  }
  return response.json();
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

  const response = await fetch(`/api/parking/search?${searchParams.toString()}`, { signal });

  if (!response.ok) {
    const error = await response.json();

    throw new Error(error.message ?? '주차장을 조회하지 못했습니다.');
  }

  return response.json();
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

  const response = await fetch(`/api/parking/${parkingLotId}?${searchParams.toString()}`, {
    signal,
  });

  if (!response.ok) {
    const error: ValidationErrorResponse = await response.json();
    throw new Error(error.message ?? '주차장 상세 정보를 조회하지 못했습니다.');
  }

  return response.json();
}

// 홈페이지에서 주차장 상세정보를 가져오는 메서드
export async function getViewportParkingLotDetail(
  parkingLotId: number,
  signal?: AbortSignal,
): Promise<ViewportParkingLotDetailResponse> {
  const response = await fetch(`/api/parking/viewport/${parkingLotId}`, {
    signal,
  });

  if (!response.ok) {
    const error: ValidationErrorResponse = await response.json();
    throw new Error(error.message ?? '주차장 상세 정보를 조회하지 못했습니다.');
  }

  return response.json();
}

// 현재 뷰포트 내 주차장 목록을 가져오는 메서드
export const getParkingLotsInViewport = async (
  params: ParkingViewportParams,
  signal?: AbortSignal,
): Promise<ParkingLotViewportResponse> => {
  const searchParams = new URLSearchParams({
    southLatitude: String(params.southLatitude),
    westLongitude: String(params.westLongitude),
    northLatitude: String(params.northLatitude),
    eastLongitude: String(params.eastLongitude),
  });

  const response = await fetch(`/api/parking/viewport?${searchParams}`, { signal });

  if (!response.ok) {
    const error = await response.json();

    throw new Error(error.message ?? '현재 지도 영역의 주차장을 불러오지 못했습니다.');
  }

  return response.json();
};
