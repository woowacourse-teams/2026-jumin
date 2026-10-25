import { useCallback } from 'react';
import { Navigate, useLocation, useNavigate, useOutletContext } from 'react-router';

import type { Destination } from '../../../api/contracts';
import { ParkingSetupContent } from './components/ParkingSetupContent';
import type { ParkingSetupView } from './types/view';
import { useStepNavigation } from '../../../shared/hooks/useStepNavigation';

interface NavigationState {
  destination?: Destination;
  setupView?: ParkingSetupView;
}

export const ParkingSetupPage = () => {
  const { move } = useStepNavigation('setup');
  const { state } = useLocation();
  const navigationState = state as NavigationState | null;
  const destination = navigationState?.destination;

  const { map } = useOutletContext<{
    map: naver.maps.Map | null;
  }>();

  const navigate = useNavigate();

  const handleSetupViewChange = useCallback(
    (setupView: ParkingSetupView) => {
      move('SAVE_VIEW', {
        ...navigationState,
        setupView,
      });
    },
    [move, navigationState],
  );

  if (!destination) {
    return <Navigate to="/search" replace />;
  }

  return (
    <ParkingSetupContent
      map={map}
      destination={destination}
      setupView={navigationState?.setupView}
      onSetupViewChange={handleSetupViewChange}
      onSearch={() => navigate('/search')}
      onRecommend={(searchCondition) => {
        navigate('/parkingRecommend', {
          state: { searchCondition },
        });
      }}
    />
  );
};
