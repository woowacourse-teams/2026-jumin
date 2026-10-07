import { Suspense } from 'react';

import { css } from '@emotion/css';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { Navigate, useLocation, useNavigate } from 'react-router';

import { ConditionBar } from '../../../shared/components/ConditionBar';
import { ParkingRecommendContent } from './components/ParkingRecommendContent';
import type { ParkingSearchCondition } from '../../../shared/types/navigation';
import { ErrorCard } from '../../../shared/components/ErrorCard';
import { ParkingRecommendSkeleton } from './LoadingUI/ParkingRecommendSkeleton';
import { formatIsoDateTime } from '../../../shared/utils/formatTime';

interface NavigationState {
  searchCondition?: ParkingSearchCondition;
}

export const ParkingRecommendPage = () => {
  const navigate = useNavigate();

  // state 가져오기
  const { state } = useLocation();
  const navigationState = state as NavigationState | null;
  const searchCondition = navigationState?.searchCondition;

  if (!searchCondition) {
    return <Navigate to="/parkingsetup" replace />;
  }

  return (
    <main className={pageStyle}>
      <ConditionBar
        title={searchCondition.destinationName}
        description={`${formatIsoDateTime(searchCondition.entryAt)} - ${formatIsoDateTime(searchCondition.exitAt)}`}
        onBack={() => navigate(-1)}
      />

      <QueryErrorResetBoundary>
        {({ reset }) => (
          <ErrorBoundary
            onReset={reset}
            fallbackRender={({ resetErrorBoundary }) => (
              <ErrorCard label="추천 주차장을 불러오지 못했어요" onRetry={resetErrorBoundary} />
            )}
          >
            <Suspense fallback={<ParkingRecommendSkeleton />}>
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
  pointer-events: none;

  width: 100%;
  height: 100%;
  overflow: hidden;
`;
