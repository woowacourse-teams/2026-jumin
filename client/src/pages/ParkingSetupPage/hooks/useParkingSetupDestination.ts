import { useQuery } from '@tanstack/react-query';

import { destinationNameQueryOptions } from '../../../../api/queries/destinationNameQuery';
import { API_ERROR_MESSAGES } from '../../../../api/apiErrorMessages';
import type { ParkingSetupView } from '../types/view';
import type { Destination } from '../../../../api/contracts';

interface Props {
  destination: Destination;
  selectedLocation: ParkingSetupView['selectedLocation'];
}

/** 목적지 조회, 로딩, 에러 */
export const useParkingSetupDestination = ({ destination, selectedLocation }: Props) => {
  // 최초 검색 위치와 선택 위치가 같은지 여부
  const isOriginalLocation =
    selectedLocation.latitude === destination.latitude &&
    selectedLocation.longitude === destination.longitude;

  const { data, isFetching, isError } = useQuery(
    destinationNameQueryOptions({
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
      enabled: !isOriginalLocation, // 최초 검색 위치와 선택 위치가 다른 경우
    }),
  );

  let destinationName = destination.name;

  if (!isOriginalLocation) {
    if (isFetching) {
      destinationName = '위치 확인중 ...';
    } else if (isError) {
      destinationName = API_ERROR_MESSAGES.DESTINATION_NAME;
    } else {
      destinationName = data?.displayName ?? '위치 확인중 ...';
    }
  }

  return {
    destinationName,
    address: isOriginalLocation ? (destination.roadAddress ?? destination.address) : undefined,
    isFetching: !isOriginalLocation && isFetching,
    isError: !isOriginalLocation && isError,
  };
};
