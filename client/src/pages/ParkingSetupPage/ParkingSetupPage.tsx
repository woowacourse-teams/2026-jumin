import { useCallback } from 'react';
import { Navigate, useNavigate, useOutletContext, useSearchParams } from 'react-router';

import { ParkingSetupContent } from './components/ParkingSetupContent';
import type { SetupDestination } from './types/destination';
import { STEP_PATH, useStepNavigation } from '../../../shared/hooks/useStepNavigation';
import { useSearchLocationQuery } from './hooks/useSearchLocationQuery';
import { buildQueryString } from '../../../shared/hooks/useQueryParams';
import type { Coordinates } from '../../../shared/types/coordinates';
import type { ParkingSearchCondition } from '../../../shared/types/navigation';

export const ParkingSetupPage = () => {
  const { move } = useStepNavigation('setup');

  // 원본 목적지의 이름은 따로 가져오기
  const [params] = useSearchParams();
  const name = params.get('name') ?? '';

  const searchLocation = useSearchLocationQuery();

  const { map } = useOutletContext<{
    map: naver.maps.Map | null;
  }>();

  const handleSelectedLocationChange = useCallback(
    (selectedLocation: Coordinates) => {
      // 실제 좌표가 같으면 이름도 유지한다.
      if (
        Number(params.get('lat')) === selectedLocation.latitude &&
        Number(params.get('lng')) === selectedLocation.longitude
      ) {
        return;
      }

      const nextQueryString = buildQueryString({
        lat: String(selectedLocation.latitude),
        lng: String(selectedLocation.longitude),
      });

      move('CHANGE_DESTINATION', undefined, { search: nextQueryString });
    },
    [move, params],
  );

  const handleRecommend = (condition: ParkingSearchCondition) => {
    const queryString = buildQueryString({
      lat: condition.destinationLatitude,
      lng: condition.destinationLongitude,
      name: condition.destinationName,
      entryAt: condition.entryAt,
      exitAt: condition.exitAt,
    });

    move('CONFIRM_DESTINATION', undefined, { search: queryString });
  };

  if (!searchLocation) {
    return <Navigate to={STEP_PATH.search} replace />;
  }

  const selectedLocation: SetupDestination = {
    latitude: searchLocation.latitude,
    longitude: searchLocation.longitude,
    name,
  };

  return (
    <ParkingSetupContent
      map={map}
      location={selectedLocation}
      onSelectedLocationChange={handleSelectedLocationChange}
      onSearch={() => move('BACK')}
      onRecommend={handleRecommend}
    />
  );
};
