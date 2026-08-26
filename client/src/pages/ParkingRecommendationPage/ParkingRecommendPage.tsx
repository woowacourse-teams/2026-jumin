import { Suspense } from 'react';

import { css } from '@emotion/css';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { Navigate, useLocation } from 'react-router';

import { SearchConditionBar } from '../../../shared/components/SearchConditionBar';
import type { ParkingSearchCondition } from '../../../shared/types/parkingSearch';
import { ParkingRecommendContent } from './components/ParkingRecommendContent';

interface NavigationState {
  searchCondition?: ParkingSearchCondition;
}

export const ParkingRecommendPage = () => {
  // state 가져오기
  const { state } = useLocation();
  const navigationState = state as NavigationState | null;
  const searchCondition = navigationState?.searchCondition;
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
            fallbackRender={({ error, resetErrorBoundary }) => (
              <div role="alert">
                <p>{error instanceof Error ? error.message : '주차장을 불러오지 못했습니다.'}</p>

                <button type="button" onClick={resetErrorBoundary}>
                  다시 시도
                </button>
              </div>
            )}
          >
            <Suspense fallback={<div>주차장을 불러오는 중...</div>}>
              <ParkingRecommendContent searchCondition={searchCondition} />
            </Suspense>
          </ErrorBoundary>
        )}
      </QueryErrorResetBoundary>
    </main>
  );
};

const pageStyle = css`
  position: relative;

  width: 100%;
  height: 100%;
  overflow: hidden;
`;
