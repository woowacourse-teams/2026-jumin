import { queryOptions } from '@tanstack/react-query';
import { getDestinationName } from '../parkingLots';

interface DestinationNameQueryParams {
  latitude: number;
  longitude: number;
  enabled: boolean;
}

export const destinationNameQueryOptions = (params: DestinationNameQueryParams) => {
  return queryOptions({
    //좌표가 다르면 서로 다른 요청으로 구분되어야함
    queryKey: [
      'latitude',
      'longitude',
      {
        latitude: params.latitude,
        longitude: params.longitude,
      },
    ],

    //Tanstack Query의 signal과 좌표를 API 함수에 전달
    queryFn: ({ signal }) => {
      return getDestinationName(params.latitude, params.longitude, signal);
    },

    // 현재 요청을 보낼지

    enabled: params.enabled,

    retry: false,
  });
};
