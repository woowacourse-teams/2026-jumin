import type { ParkingLotDetailResponse, ParkingSearchResponse, ValidationErrorResponse } from './contracts';

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

export async function getParkingLotDetail(
  parkingLotId: number,
  params: ParkingDetailParams,
): Promise<ParkingLotDetailResponse> {
  const searchParams = new URLSearchParams({
    destinationLatitude: String(params.destinationLatitude),
    destinationLongitude: String(params.destinationLongitude),
    entryAt: params.entryAt,
    exitAt: params.exitAt,
  });

  const response = await fetch(`/api/parking/${parkingLotId}?${searchParams.toString()}`);

  if (!response.ok) {
    const error: ValidationErrorResponse = await response.json();
    throw new Error(error.message ?? '주차장 상세 정보를 조회하지 못했습니다.');
  }

  return response.json();
}
