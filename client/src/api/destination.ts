import type { DestinationNameResponse, DestinationSearchResponse } from './contracts';
import { destinationNameSchema, destinationSearchSchema } from './destinationSchema';
import { parseApiResponse } from './parseApiResponse';
import { request } from './request';

// 목적지를 검색 및 자동완성하는 메서드
export const searchDestinations = async (
  query: string,
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<DestinationSearchResponse> => {
  const params = new URLSearchParams({
    query,
    latitude: String(latitude),
    longitude: String(longitude),
  });
  const response = await request(`/api/destinations/search?${params.toString()}`, {
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
