import type { ParkingSearchResponse } from './contracts';

export interface ParkingSearchParams {
  destinationLatitude: number;
  destinationLongitude: number;
  entryAt: string;
  exitAt: string;
}

export async function searchParkingLots(params: ParkingSearchParams): Promise<ParkingSearchResponse> {
  const searchParams = new URLSearchParams({
    destinationLatitude: String(params.destinationLatitude),
    destinationLongitude: String(params.destinationLongitude),
    entryAt: params.entryAt,
    exitAt: params.exitAt,
  });

  const response = await fetch(`/api/parking-lots/search?${searchParams.toString()}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message ?? '주차장을 조회하지 못했습니다.');
  }

  return response.json();
}
