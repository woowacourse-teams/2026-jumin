import { useLayoutEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { ParkingLotViewport } from '../../../../api/contracts';
import { viewportParkingLotDetailQueryOptions } from '../../../../api/queries/viewportParkingLotDetailQuery';
import BottomSheet, {
  BOTTOM_SHEET_HEIGHT,
  type BottomSheetSnap,
} from '../../../../shared/components/ui/BottomSheet';
import { ErrorCard } from '../../../../shared/components/service/ErrorCard';
import { ParkingDetailSkeleton } from '../../ParkingDetailPage/LoadingUI/ParkingDetailSkeleton';
import { ParkingInformationContent } from './ParkingInformationContent';
import { ConditionBar } from '../../../../shared/components/service/ConditionBar';
import { API_ERROR_MESSAGES } from '../../../../api/apiErrorMessages';
import { getMapCenterForMarkerY } from '../../../../shared/maps/getMapCenterForMarkerY';

const MARKER_GAP = 64;

interface Props {
  map: naver.maps.Map | null;
  parkingLot: ParkingLotViewport;
  snap: BottomSheetSnap;
  onSnapChange: (snap: BottomSheetSnap) => void;
  onClose: () => void;
}

export const ParkingInformationPanel = ({
  map,
  parkingLot,
  snap,
  onSnapChange,
  onClose,
}: Props) => {
  const detailQuery = useQuery(viewportParkingLotDetailQueryOptions(parkingLot.id));

  // 바텀시트가 펼쳐질 때 마커가 가려지지 않도록 화면이 그려지기 전에 지도 이동을 요청한다.
  // panTo의 애니메이션이 이 effect 안에서 끝나는 것은 아니다.
  useLayoutEffect(() => {
    if (!map || snap !== 'expanded') return;

    const parkingLotPosition = new naver.maps.LatLng(parkingLot.latitude, parkingLot.longitude);
    // BottomSheet의 실제 CSS 높이에 쓰는 상수를 공유해 DOM에서 높이를 다시 측정하지 않는다.
    // 바텀시트 상단보다 64px 위를 홈 화면에서 마커가 보일 위치로 정한다.
    const targetMarkerY = map.getSize().height - BOTTOM_SHEET_HEIGHT - MARKER_GAP;
    // 화면은 목표 높이를 정하고, 공통 함수는 그 높이에 마커를 놓을 지도 중심을 계산한다.
    const center = getMapCenterForMarkerY(map, parkingLotPosition, targetMarkerY);

    // 주차장 위치는 바꾸지 않고 지도 중심만 300ms 동안 이동한다.
    map.panTo(center, { duration: 300 });
  }, [map, parkingLot.latitude, parkingLot.longitude, snap]);

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

  return (
    <>
      <ConditionBar
        title={detailQuery.data?.name ?? '주차장 이름'}
        description={detailQuery.data?.address ?? '주차장 주소'}
        onBack={onClose}
      />
      <BottomSheet snap={snap} onSnapChange={onSnapChange}>
        {renderContent()}
      </BottomSheet>
    </>
  );
};
