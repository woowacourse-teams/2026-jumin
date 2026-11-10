import { css } from '@emotion/css';
import { useLayoutEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { ParkingLotViewport } from '../../../api/contracts';
import { viewportParkingLotDetailQueryOptions } from '../../../api/queries/viewportParkingLotDetailQueryOptions';
import BottomSheet, { type BottomSheetSnap } from '../../../shared/components/ui/BottomSheet';
import { ErrorCard } from '../../../shared/components/service/ErrorCard';
import { ParkingDetailSkeleton } from '../../ParkingRecommendPage/LoadingUI/ParkingDetailSkeleton';
import { ParkingInformationContent } from './ParkingInformationContent';
import { ConditionBar } from '../../../shared/components/service/ConditionBar';
import { API_ERROR_MESSAGES } from '../../../api/apiErrorMessages';
import { useVisibleMapCenter } from '../../../shared/hooks/useVisibleMapCenter';

interface Props {
  map: naver.maps.Map | null;
  parkingLot: ParkingLotViewport;
  open?: boolean;
  snap: BottomSheetSnap;
  onSnapChange: (snap: BottomSheetSnap) => void;
  onClose: () => void;
}

export const ParkingInformationPanel = ({
  map,
  parkingLot,
  open = true,
  snap,
  onSnapChange,
  onClose,
}: Props) => {
  const detailQuery = useQuery(viewportParkingLotDetailQueryOptions(parkingLot.id));
  const { conditionBarRef, getTargetMapCenter } = useVisibleMapCenter();

  // 바텀시트가 펼쳐질 때 마커가 가려지지 않도록 화면이 그려지기 전에 지도 이동을 요청한다.
  // panTo의 애니메이션이 이 effect 안에서 끝나는 것은 아니다.
  useLayoutEffect(() => {
    if (!open || !map || snap === 'full') return;

    const markerLatLng = new naver.maps.LatLng(parkingLot.latitude, parkingLot.longitude);

    // 화면은 목표 높이를 정하고, 공통 함수는 그 높이에 마커를 놓을 지도 중심을 계산한다.
    const targetMapCenter = getTargetMapCenter(map, snap, markerLatLng);
    if (!targetMapCenter) return;
    // 주차장 위치는 바꾸지 않고 지도 중심만 300ms 동안 이동한다.
    map.panTo(targetMapCenter, { duration: 300 });
  }, [open, map, parkingLot.latitude, parkingLot.longitude, snap, getTargetMapCenter]);

  const renderContent = () => {
    if (detailQuery.isPending) {
      return <ParkingDetailSkeleton />;
    }

    if (detailQuery.isError) {
      return (
        <ErrorCard
          label={API_ERROR_MESSAGES.HOME_PARKING_DETAIL}
          onRetry={() => {
            void detailQuery.refetch();
          }}
        />
      );
    }

    return <ParkingInformationContent parkingLot={parkingLot} data={detailQuery.data} />;
  };

  const conditionBar = (
    <ConditionBar
      elementRef={conditionBarRef}
      title={detailQuery.data?.name ?? '주차장 이름'}
      description={detailQuery.data?.address ?? '주차장 주소'}
      onBack={onClose}
    />
  );

  return (
    <>
      {open && snap !== 'full' && conditionBar}
      <BottomSheet
        open={open}
        snap={snap}
        onSnapChange={onSnapChange}
        header={snap === 'full' ? <div className={fullHeaderStyle}>{conditionBar}</div> : undefined}
      >
        {renderContent()}
      </BottomSheet>
    </>
  );
};

// 전체 화면에서는 지도 위의 검색 조건 바를 시트 안에 배치한다.
const fullHeaderStyle = css`
  > header {
    position: static;
    margin: 0 16px 16px;
    box-shadow: none;
  }
`;
