import { Navigate, useLocation, useNavigate, useOutletContext } from 'react-router';

import type { Destination } from '../../../api/contracts';
import { ParkingSetupContent } from './components/ParkingSetupContent';

interface NavigationState {
  destination?: Destination;
}

export const ParkingSetupPage = () => {
  const { state } = useLocation();
  const destination = (state as NavigationState | null)?.destination;

  const map = useOutletContext<naver.maps.Map | null>();

  const navigate = useNavigate();

  if (!destination) {
    return <Navigate to="/search" replace />;
  }

  return (
    <ParkingSetupContent
      map={map}
      destination={destination}
      onSearch={() => navigate('/search')}
      onRecommend={(searchCondition) => {
        navigate('/parkingRecommend', {
          state: { searchCondition },
        });
      }}
    />
  );
};
