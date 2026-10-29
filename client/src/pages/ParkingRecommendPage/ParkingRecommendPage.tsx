import { Suspense, useRef, useCallback } from 'react';

import { css } from '@emotion/css';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { Navigate, useLocation, useOutletContext } from 'react-router';

import { ConditionBar } from '../../../shared/components/service/ConditionBar';
import { ParkingRecommendContent } from './components/ParkingRecommendContent';
import { ErrorCard } from '../../../shared/components/service/ErrorCard';
import { ParkingRecommendSkeleton } from './LoadingUI/ParkingRecommendSkeleton';
import { formatIsoDateTime } from '../../../shared/utils/formatTime';
import type { ParkingSearchCondition } from '../../../shared/types/navigation';
import { API_ERROR_MESSAGES } from '../../../api/apiErrorMessages';
import { STEP_PATH, useStepNavigation } from '../../../shared/hooks/useStepNavigation';
import type { RecommendView } from './types/view';

export interface NavigationState {
  searchCondition: ParkingSearchCondition;
  recommendView?: RecommendView;
}

export const ParkingRecommendPage = () => {
  const { move } = useStepNavigation('recommend');
  // ConditionBar가 이 ref에 header 요소를 연결하면 Content가 같은 ref로 위치를 읽는다.
  // 두 컴포넌트를 함께 렌더링하는 Page에서 ref를 만들어 전달한다.
  const conditionBarRef = useRef<HTMLElement>(null);

  // state 가져오기
  const { state } = useLocation();
  const navigationState = state as NavigationState | null;
  const searchCondition = navigationState?.searchCondition;

  const { map } = useOutletContext<{
    map: naver.maps.Map | null;
  }>();

  // 셋업 페이지와 마찬가지로 선택 주차장/추천 유형 변경 시의 view 저장 핸들러
  const saveView = useCallback(
    (recommendView: RecommendView) => {
      move('SAVE_VIEW', {
        ...navigationState,
        recommendView,
      });
    },
    [move, navigationState],
  );

  if (!searchCondition) {
    return <Navigate to={STEP_PATH.setup} replace />;
  }

  return (
    <main className={pageStyle}>
      <ConditionBar
        elementRef={conditionBarRef}
        title={searchCondition.destinationName}
        description={`${formatIsoDateTime(searchCondition.entryAt)} - ${formatIsoDateTime(searchCondition.exitAt)}`}
        onBack={() => move('BACK')}
      />

      <QueryErrorResetBoundary>
        {({ reset }) => (
          <ErrorBoundary
            onReset={reset}
            fallbackRender={({ resetErrorBoundary }) => (
              <ErrorCard label={API_ERROR_MESSAGES.RECOMMENDATION} onRetry={resetErrorBoundary} />
            )}
          >
            <Suspense fallback={<ParkingRecommendSkeleton />}>
              <ParkingRecommendContent
                map={map}
                searchCondition={searchCondition}
                recommendView={navigationState?.recommendView}
                conditionBarRef={conditionBarRef}
                onSaveView={saveView}
                onDetail={(detailCondition) => {
                  move('OPEN_DETAIL', { detailCondition });
                }}
              />
            </Suspense>
          </ErrorBoundary>
        )}
      </QueryErrorResetBoundary>
    </main>
  );
};

const pageStyle = css`
  position: relative;
  pointer-events: none;

  width: 100%;
  height: 100%;
  overflow: hidden;
`;
