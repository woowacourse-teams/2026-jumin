import { useCallback } from 'react';
import { Navigate, useNavigate, useOutletContext, useSearchParams } from 'react-router';

import { ParkingSetupContent } from './components/ParkingSetupContent';
import type { Coordinates, SetupDestination } from './types/destination';
import { useStepNavigation } from '../../../shared/hooks/useStepNavigation';
import { useRestoreLocation } from './hooks/useRestoreLocation';

export const ParkingSetupPage = () => {
  const { move } = useStepNavigation('setup');

  const [params] = useSearchParams();
  const name = params.get('name') ?? '';

  const restoredLocation = useRestoreLocation();

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

      const nextParams = new URLSearchParams(params);

      nextParams.set('lat', String(selectedLocation.latitude));
      nextParams.set('lng', String(selectedLocation.longitude));
      nextParams.delete('name');

      move('CHANGE_DESTINATION', undefined, {
        search: `?${nextParams.toString()}`,
      });
    },
    [move, params],
  );

  const navigate = useNavigate();
  if (!restoredLocation) {
    return <Navigate to="/search" replace />;
  }

  const selectedLocation: SetupDestination = {
    latitude: restoredLocation.latitude,
    longitude: restoredLocation.longitude,
    name,
  };

  return (
    <ParkingSetupContent
      map={map}
      location={selectedLocation}
      onSelectedLocationChange={handleSelectedLocationChange}
      onSearch={() => move('BACK')}
      onRecommend={(searchCondition) => {
        navigate('/parkingRecommend', {
          state: { searchCondition },
        });
      }}
    />
  );
};
