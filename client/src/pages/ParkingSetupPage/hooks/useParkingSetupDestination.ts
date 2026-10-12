import { useQuery } from '@tanstack/react-query';

import { destinationNameQueryOptions } from '../../../../api/queries/destinationNameQuery';
import type { ParkingSetupView } from '../../../../shared/types/navigation';

interface Props {
  initialName: string;
  selectedLocation: ParkingSetupView['selectedLocation'];
  hasMovedMap: boolean;
}

/** 목적지 조회, 로딩, 에러 */
export const useParkingSetupDestination = ({
  initialName,
  selectedLocation,
  hasMovedMap,
}: Props) => {
  const { data, isFetching, isError } = useQuery(
    destinationNameQueryOptions({
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
      enabled: hasMovedMap,
    }),
  );

  let destinationName = initialName;

  if (hasMovedMap) {
    if (isFetching) {
      destinationName = '위치 확인중 ...';
    } else if (isError) {
      destinationName = '위치 이름을 불러오지 못했습니다.';
    } else if (data) {
      destinationName = data.displayName;
    }
  }

  return {
    destinationName,
    isFetching,
    isError,
  };
};
