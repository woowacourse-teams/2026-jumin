import { useLayoutEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { ParkingLotViewport } from '../../../../api/contracts';
import { viewportParkingLotDetailQueryOptions } from '../../../../api/queries/viewportParkingLotDetailQuery';
import BottomSheet, { type BottomSheetSnap } from '../../../../shared/components/BottomSheet';
import { ErrorCard } from '../../../../shared/components/ErrorCard';
import { ParkingLotHeader } from '../../../../shared/components/ParkingLotHeader';
import { ParkingDetailSkeleton } from '../../ParkingDetailPage/LoadingUI/ParkingDetailSkeleton';
import { ParkingInformationContent } from './ParkingInformationContent';

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

  useLayoutEffect(() => {
    if (!map || snap !== 'expanded') return;

    const sheet = document.querySelector<HTMLElement>('[data-bottom-sheet]');
    if (!sheet) return;

    const mapHeight = map.getSize().height;
    const targetMarkerY = mapHeight - sheet.offsetHeight - MARKER_GAP;

    const parkingLotPosition = new naver.maps.LatLng(parkingLot.latitude, parkingLot.longitude);

    const projection = map.getProjection();
    const markerOffset = projection.fromCoordToOffset(parkingLotPosition);

    const targetCenterOffset = new naver.maps.Point(
      markerOffset.x,
      mapHeight / 2 + markerOffset.y - targetMarkerY,
    );

    map.panTo(projection.fromOffsetToCoord(targetCenterOffset), {
      duration: 300,
    });
  }, [map, parkingLot.latitude, parkingLot.longitude, snap]);

  const renderContent = () => {
    if (detailQuery.isPending) {
      return <ParkingDetailSkeleton />;
    }

    if (detailQuery.isError) {
      return (
        <ErrorCard
          label="주차장 정보를 불러오지 못했어요"
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
      <ParkingLotHeader
        parkingLotName={detailQuery.data?.name ?? '주차장 이름'}
        parkingLotAddress={detailQuery.data?.address ?? '주차장 주소'}
        onBack={onClose}
      />
      <BottomSheet snap={snap} onSnapChange={onSnapChange}>
        {renderContent()}
      </BottomSheet>
    </>
  );
};
