import { Suspense } from 'react';

import { css } from '@emotion/css';

import { Navigate, useLocation } from 'react-router';

import { ParkingDetailCondition } from '../../../shared/types/navigation';
import { ParkingDetailContent } from './components/ParkingDetailContent';
import { ParkingLotHeader } from './components/ParkingLotHeader';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';

interface NavigationState {
  detailCondition?: ParkingDetailCondition;
}

export const ParkingDetailPage = () => {
  const { state } = useLocation();
  const navigationState = state as NavigationState | null;
  const detailCondition = navigationState?.detailCondition;

  if (!detailCondition) {
    return <Navigate to="/parkingsetup" replace />;
  }

  return (
    <main className={pageStyle}>
      <ParkingLotHeader parkingLotName={detailCondition.parkingLotName} />

      <QueryErrorResetBoundary>
        {({ reset }) => (
          <ErrorBoundary
            onReset={reset}
            fallbackRender={({ error, resetErrorBoundary }) => (
              <div role="alert">
                <p>{error instanceof Error ? error.message : '상세 정보를 불러오지 못했습니다.'}</p>

                <button type="button" onClick={resetErrorBoundary}>
                  다시 시도
                </button>
              </div>
            )}
          >
            <Suspense fallback={<div>상세 정보를 불러오는 중...</div>}>
              <ParkingDetailContent detailCondition={detailCondition} />
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

  color: #14213d;

  background: transparent;
`;
