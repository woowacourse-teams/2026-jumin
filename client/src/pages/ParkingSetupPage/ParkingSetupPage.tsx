import { useCallback } from 'react';
import { Navigate, useLocation, useNavigate, useOutletContext } from 'react-router';

import type { Destination } from '../../../api/contracts';
import type { ParkingSetupView, RecommendView } from '../../../shared/types/navigation';
import { ParkingSetupContent } from './components/ParkingSetupContent';

interface NavigationState {
  destination?: Destination;
  setupView?: ParkingSetupView;
}

export const ParkingSetupPage = () => {
  const { state } = useLocation();
  const navigationState = state as NavigationState | null;
  const destination = navigationState?.destination;

  const { map, setRecommendView } = useOutletContext<{
    map: naver.maps.Map | null;
    setRecommendView: (view: RecommendView | null) => void;
  }>();

  const navigate = useNavigate();

  const handleSetupViewChange = useCallback(
    (setupView: ParkingSetupView) => {
      navigate('/parkingsetup', {
        replace: true,
        state: {
          ...navigationState,
          setupView,
        },
      });
    },
    [navigate, navigationState],
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
        setRecommendView(null);
        navigate('/parkingRecommend', {
          state: { searchCondition },
        });
      }}
    />
  );
};
