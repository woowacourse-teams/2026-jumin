import type {
  DestinationNameResponse,
  DestinationSearchResponse,
  ParkingLotDetailResponse,
  ParkingSearchResponse,
  ValidationErrorResponse,
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
