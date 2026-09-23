import { Navigate, useLocation, useNavigate, useOutletContext } from 'react-router';

import type { Destination } from '../../../api/contracts';
import type { RecommendView } from '../../../shared/types/navigation';
import { ParkingSetupContent } from './components/ParkingSetupContent';

interface NavigationState {
  destination?: Destination;
}

export const ParkingSetupPage = () => {
  const { state } = useLocation();
  const destination = (state as NavigationState | null)?.destination;

  const { map, setRecommendView } = useOutletContext<{
    map: naver.maps.Map | null;
    setRecommendView: (view: RecommendView | null) => void;
  }>();

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
        setRecommendView(null);
        navigate('/parkingRecommend', {
          state: { searchCondition },
        });
      }}
    />
  );
};
