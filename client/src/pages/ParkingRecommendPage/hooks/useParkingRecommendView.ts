import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import type {
  ParkingDetailCondition,
  ParkingSearchCondition,
  RecommendView,
} from '../../../../shared/types/navigation';
import type { NavigationState } from '../ParkingRecommendPage';

const DEFAULT_RECOMMEND_VIEW: RecommendView = {
  snap: 'collapsed',
  parkingLotId: null,
  recommendationType: 'DISTANCE',
};

export const useParkingRecommendView = (searchCondition: ParkingSearchCondition) => {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationState = location.state as NavigationState | null;
  const savedView = navigationState?.recommendView;
  const view = savedView ?? DEFAULT_RECOMMEND_VIEW;
  const [pendingDetail, setPendingDetail] = useState<ParkingDetailCondition | null>(null);

  const updateView = useCallback(
    (patch: Partial<RecommendView>) => {
      const nextView = { ...view, ...patch };

      if (
        nextView.snap === view.snap &&
        nextView.parkingLotId === view.parkingLotId &&
        nextView.recommendationType === view.recommendationType
      ) {
        return;
      }

      navigate(
        { pathname: location.pathname, search: location.search, hash: location.hash },
        {
          replace: true,
          state: { ...navigationState, searchCondition, recommendView: nextView },
        },
      );
    },
    [
      view,
      navigate,
      location.pathname,
      location.search,
      location.hash,
      navigationState,
      searchCondition,
    ],
  );

  const openDetail = (detailCondition: ParkingDetailCondition) => {
    updateView({ parkingLotId: detailCondition.parkingLotId });
    setPendingDetail(detailCondition);
  };

  useEffect(() => {
    if (!pendingDetail || savedView?.parkingLotId !== pendingDetail.parkingLotId) return;

    // 추천 히스토리의 갱신이 반영된 뒤 상세 기록을 추가한다.
    // 상세 이동 시 이 훅이 언마운트되므로 대기 상태를 따로 초기화하지 않는다.
    navigate('/parkingDetail', { state: { detailCondition: pendingDetail } });
  }, [pendingDetail, savedView?.parkingLotId, navigate]);

  return { view, savedView, updateView, openDetail };
};
