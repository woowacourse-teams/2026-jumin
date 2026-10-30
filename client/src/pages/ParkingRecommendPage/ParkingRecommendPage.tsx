import { Navigate, useOutletContext } from 'react-router';
import { STEP_PATH, useStepNavigation } from '../../../shared/hooks/useStepNavigation';
import { ParkingRecommendPanel } from './components/ParkingRecommendPanel';
import { useSearchConditionQuery } from './hooks/useSearchConditionQuery';
import { buildQueryString, useQueryParams } from '../../../shared/hooks/useQueryParams';
import { parseCoordinates } from '../../../shared/utils/parseCoordinates';

export const ParkingRecommendPage = () => {
  const { move } = useStepNavigation('recommend');
  const { map } = useOutletContext<{ map: naver.maps.Map | null }>();

  const searchCondition = useSearchConditionQuery();
  const params = useQueryParams();

  // 추천 조건이 잘못돼도 좌표가 유효하면 목적지를 보존해 셋업으로 replace한다.
  if (!searchCondition) {
    const coordinates = parseCoordinates(params.get('lat'), params.get('lng'));
    if (!coordinates) return <Navigate to={STEP_PATH.home} replace />;

    return (
      <Navigate
        to={{
          pathname: STEP_PATH.setup,
          search: buildQueryString({
            lat: coordinates.latitude,
            lng: coordinates.longitude,
            name: params.get('name')?.trim() || undefined,
          }),
        }}
        replace
      />
    );
  }

  return (
    <ParkingRecommendPanel
      map={map}
      searchCondition={searchCondition}
      onBack={() => move('BACK')}
    />
  );
};
