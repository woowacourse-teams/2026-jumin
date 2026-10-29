import { Navigate, useOutletContext } from 'react-router';
import { STEP_PATH, useStepNavigation } from '../../../shared/hooks/useStepNavigation';
import { ParkingRecommendPanel } from './components/ParkingRecommendPanel';
import { useSearchConditionQuery } from '../HomePage/hooks/useSearchConditionQuery';

export const ParkingRecommendPage = () => {
  const { move } = useStepNavigation('recommend');
  const { map } = useOutletContext<{ map: naver.maps.Map | null }>();

  const searchCondition = useSearchConditionQuery();

  if (!searchCondition) return <Navigate to={STEP_PATH.setup} replace />;

  return (
    <ParkingRecommendPanel
      map={map}
      searchCondition={searchCondition}
      onBack={() => move('BACK')}
    />
  );
};
