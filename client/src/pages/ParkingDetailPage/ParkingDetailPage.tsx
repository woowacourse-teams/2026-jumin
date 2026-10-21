import { Suspense } from 'react';

import { css } from '@emotion/css';

import { Navigate, useLocation, useNavigate, useOutletContext } from 'react-router';

import type { ParkingDetailCondition } from '../../../shared/types/navigation';
import { ParkingDetailContent } from './components/ParkingDetailContent';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorCard } from '../../../shared/components/service/ErrorCard';
import { ParkingDetailSkeleton } from './LoadingUI/ParkingDetailSkeleton';
import { ConditionBar } from '../../../shared/components/service/ConditionBar';
import { color } from '../../theme/color';
import { API_ERROR_MESSAGES } from '../../../api/apiErrorMessages';

interface NavigationState {
  detailCondition?: ParkingDetailCondition;
}

export const ParkingDetailPage = () => {
  const navigate = useNavigate();
  const { state } = useLocation();
  const navigationState = state as NavigationState | null;
  const detailCondition = navigationState?.detailCondition;

  const { map } = useOutletContext<{ map: naver.maps.Map | null }>();

  if (!detailCondition) {
    return <Navigate to="/parkingsetup" replace />;
  }

  return (
    <main className={pageStyle}>
      <ConditionBar
        title={detailCondition.parkingLotName}
        description={detailCondition.destinationName}
        onBack={() => navigate(-1)}
      />

      <QueryErrorResetBoundary>
        {({ reset }) => (
          <ErrorBoundary
            onReset={reset}
            fallbackRender={({ resetErrorBoundary }) => (
              <ErrorCard label={API_ERROR_MESSAGES.parkingDetail} onRetry={resetErrorBoundary} />
            )}
          >
            <Suspense fallback={<ParkingDetailSkeleton />}>
              <ParkingDetailContent map={map} detailCondition={detailCondition} />
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
  color: ${color.text.primary};
  background: transparent;
`;
