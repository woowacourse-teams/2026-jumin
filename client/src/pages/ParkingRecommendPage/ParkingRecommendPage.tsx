import { Navigate, useLocation, useOutletContext } from 'react-router';
import { STEP_PATH, useStepNavigation } from '../../../shared/hooks/useStepNavigation';
import type { ParkingSearchCondition } from '../../../shared/types/navigation';
import { ParkingRecommendPanel } from './components/ParkingRecommendPanel';

interface NavigationState {
  searchCondition?: ParkingSearchCondition;
}

export const ParkingRecommendPage = () => {
  const { key, state } = useLocation();
  const { move } = useStepNavigation('recommend');
  const { map } = useOutletContext<{ map: naver.maps.Map | null }>();
  const searchCondition = (state as NavigationState | null)?.searchCondition;

  if (!searchCondition) return <Navigate to={STEP_PATH.setup} replace />;

  return (
    <ParkingRecommendPanel
      key={key}
      map={map}
      searchCondition={searchCondition}
      onBack={() => move('BACK')}
    />
  );
};
