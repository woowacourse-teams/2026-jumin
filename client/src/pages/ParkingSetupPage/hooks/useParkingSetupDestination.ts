import { useQuery } from '@tanstack/react-query';

import { destinationNameQueryOptions } from '../../../../api/queries/destinationNameQuery';
import { API_ERROR_MESSAGES } from '../../../../api/apiErrorMessages';
import type { SetupDestination } from '../types/destination';

interface Props {
  selectedLocation: SetupDestination;
}

/** 목적지 조회(역지오코딩), 로딩, 에러 */
export const useParkingSetupDestination = ({ selectedLocation }: Props) => {
  const name = selectedLocation.name?.trim();

  const { data, isFetching, isError } = useQuery(
    destinationNameQueryOptions({
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
      enabled: !name,
    }),
  );

  if (name) {
    return {
      destinationName: name,
      isFetching: false,
      isError: false,
    };
  }

  return {
    destinationName: isError
      ? API_ERROR_MESSAGES.DESTINATION_NAME
      : (data?.displayName ?? '위치 확인중 ...'),
    isFetching,
    isError,
  };
};
