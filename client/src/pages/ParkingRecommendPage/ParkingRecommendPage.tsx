import { Suspense } from 'react';

import { css } from '@emotion/css';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { Navigate, useLocation, useOutletContext } from 'react-router';

import { SearchConditionBar } from '../../../shared/components/SearchConditionBar';
import { ParkingRecommendContent } from './components/ParkingRecommendContent';
import { ParkingSearchCondition } from '../../../shared/types/navigation';
import { ErrorCard } from '../../../shared/components/ErrorCard';

interface NavigationState {
  searchCondition?: ParkingSearchCondition;
}

export const ParkingRecommendPage = () => {
  // state 가져오기
  const { state } = useLocation();
  const navigationState = state as NavigationState | null;
  const searchCondition = navigationState?.searchCondition;
  const map = useOutletContext<naver.maps.Map | null>();

  if (!searchCondition) {
    return <Navigate to="/parkingsetup" replace />;
  }

  return (
    <main className={pageStyle}>
      <SearchConditionBar
        destinationName={searchCondition.destinationName}
        entryAt={searchCondition.entryAt}
        exitAt={searchCondition.exitAt}
      />

      <QueryErrorResetBoundary>
        {({ reset }) => (
          <ErrorBoundary
            onReset={reset}
            fallbackRender={({ resetErrorBoundary }) => (
              <ErrorCard label="추천 주차장을 불러오지 못했어요" onRetry={resetErrorBoundary} />
            )}
          >
            <Suspense fallback={<div>주차장을 불러오는 중...</div>}>
              <ParkingRecommendContent map={map} searchCondition={searchCondition} />
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
