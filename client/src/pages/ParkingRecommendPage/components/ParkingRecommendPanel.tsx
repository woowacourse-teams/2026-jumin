import { useEffect, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { useQuery } from '@tanstack/react-query';

import type { ParkingLotSummary } from '../../../../api/contracts';
import { API_ERROR_MESSAGES } from '../../../../api/apiErrorMessages';
import { parkingSearchQueryOptions } from '../../../../api/queries/parkingSearchQuery';
import { ConditionBar } from '../../../../shared/components/service/ConditionBar';
import { ErrorCard } from '../../../../shared/components/service/ErrorCard';
import BottomSheet, { BOTTOM_SHEET_HEIGHT } from '../../../../shared/components/ui/BottomSheet';
import { useMapClick } from '../../../../shared/hooks/useMapClick';
import { getMapCenterForMarkerY } from '../../../../shared/maps/getMapCenterForMarkerY';
import type { ParkingSearchCondition } from '../../../../shared/types/navigation';
import type { BottomSheetSnap } from '../../../../shared/types/ui';
import { formatIsoDateTime } from '../../../../shared/utils/formatTime';
import { ParkingRecommendSkeleton } from '../LoadingUI/ParkingRecommendSkeleton';
import type { RecommendationType } from '../types/recommendation';
import { getSortValue, sortParkingLots } from '../utils/sorting';
import { ParkingMarkers } from './ParkingMarkers';
import { ParkingRecommendContent } from './ParkingRecommendContent';
import { ParkingRecommendDetailPanel } from './ParkingRecommendDetailPanel';

interface Props {
  map: naver.maps.Map | null;
  searchCondition: ParkingSearchCondition;
  onBack: () => void;
}

/** 추천/상세 전환, 선택과 지도, 공통 시트의 상태를 연결한다. */
export const ParkingRecommendPanel = ({ map, searchCondition, onBack }: Props) => {
  const recommendationQuery = useQuery(parkingSearchQueryOptions(searchCondition));
  const [recommendationType, setRecommendationType] = useState<RecommendationType>('BALANCED');
  const [selectedParkingLot, setSelectedParkingLot] = useState<ParkingLotSummary | null>(null);
  const [detailParkingLot, setDetailParkingLot] = useState<ParkingLotSummary | null>(null);
  const [recommendationSnap, setRecommendationSnap] = useState<BottomSheetSnap>('expanded');
  const [detailSnap, setDetailSnap] = useState<BottomSheetSnap>('expanded');
  const conditionBarRef = useRef<HTMLElement>(null);

  // 상세 대상의 유무로 모드를 구분해 별도의 mode와 대상이 어긋나지 않게 한다.
  const isDetail = detailParkingLot !== null;
  const sheetSnap = isDetail ? detailSnap : recommendationSnap;
  const setSheetSnap = isDetail ? setDetailSnap : setRecommendationSnap;

  const parkingLots = useMemo(
    () => sortParkingLots(recommendationQuery.data?.parkingLots ?? [], recommendationType),
    [recommendationQuery.data, recommendationType],
  );
  const recommendedParkingLots = useMemo(
    () => parkingLots.filter((lot) => getSortValue(lot, recommendationType) !== null).slice(0, 3),
    [parkingLots, recommendationType],
  );
  const activeParkingLot = selectedParkingLot ?? parkingLots[0] ?? null;

  useMapClick({
    map,
    enabled: sheetSnap === 'expanded',
    onMapClick: () => setSheetSnap('collapsed'),
  });

  useEffect(() => {
    if (!map || !activeParkingLot) return;

    const position = new naver.maps.LatLng(
      activeParkingLot.location.latitude,
      activeParkingLot.location.longitude,
    );

    if (isDetail) {
      map.fitBounds(
        [
          new naver.maps.LatLng(
            searchCondition.destinationLatitude,
            searchCondition.destinationLongitude,
          ),
          position,
        ],
        {
          top: 112,
          right: 40,
          bottom: sheetSnap === 'expanded' ? BOTTOM_SHEET_HEIGHT + 24 : 124,
          left: 40,
          maxZoom: 15,
        },
      );
      map.panBy(new naver.maps.Point(0, 100));
      return;
    }

    if (sheetSnap === 'collapsed') {
      map.panTo(position);
      return;
    }

    const header = conditionBarRef.current;
    if (!header) return;

    const headerBottom =
      header.getBoundingClientRect().bottom - map.getElement().getBoundingClientRect().top;
    const targetY = (headerBottom + map.getSize().height - BOTTOM_SHEET_HEIGHT) / 2;
    const center = getMapCenterForMarkerY(map, position, targetY);
    map.panTo(center, { duration: 300 });
  }, [map, activeParkingLot, isDetail, sheetSnap, searchCondition]);

  const selectParkingLot = (parkingLot: ParkingLotSummary) => {
    // 같은 주차장을 다시 눌러도 사용자가 옮긴 지도를 해당 위치로 이동한다.
    setSelectedParkingLot({ ...parkingLot });
    setSheetSnap('expanded');
  };

  const openDetail = (parkingLot: ParkingLotSummary) => {
    setSelectedParkingLot({ ...parkingLot });
    setDetailSnap('expanded');
    setDetailParkingLot(parkingLot);
  };

  return (
    <main className={pageStyle}>
      <ConditionBar
        elementRef={conditionBarRef}
        title={detailParkingLot?.name ?? searchCondition.destinationName}
        description={
          isDetail
            ? searchCondition.destinationName
            : `${formatIsoDateTime(searchCondition.entryAt)} - ${formatIsoDateTime(searchCondition.exitAt)}`
        }
        onBack={isDetail ? () => setDetailParkingLot(null) : onBack}
      />
      <ParkingMarkers
        map={map}
        destination={{
          name: searchCondition.destinationName,
          latitude: searchCondition.destinationLatitude,
          longitude: searchCondition.destinationLongitude,
        }}
        parkingLots={detailParkingLot ? [detailParkingLot] : parkingLots}
        recommendedParkingLots={recommendedParkingLots}
        selectedParkingLotId={activeParkingLot?.id ?? null}
        isDetail={isDetail}
        onSelect={selectParkingLot}
      />
      <BottomSheet snap={sheetSnap} onSnapChange={setSheetSnap}>
        <div className={contentStyle} hidden={isDetail}>
          {recommendationQuery.data ? (
            <ParkingRecommendContent
              parkingLots={parkingLots}
              recommendedCount={recommendedParkingLots.length}
              recommendationType={recommendationType}
              selectedParkingLot={activeParkingLot}
              isActive={!isDetail}
              sheetSnap={recommendationSnap}
              onTypeChange={(type) => {
                setRecommendationType(type);
                setSelectedParkingLot(null);
              }}
              onSelect={selectParkingLot}
              onDetail={openDetail}
            />
          ) : recommendationQuery.isError ? (
            <ErrorCard
              className={inlineErrorStyle}
              label={API_ERROR_MESSAGES.RECOMMENDATION}
              onRetry={() => void recommendationQuery.refetch()}
            />
          ) : (
            <ParkingRecommendSkeleton />
          )}
        </div>
        {detailParkingLot && (
          <ParkingRecommendDetailPanel
            key={detailParkingLot.id}
            parkingLotId={detailParkingLot.id}
            searchCondition={searchCondition}
          />
        )}
      </BottomSheet>
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

const contentStyle = css`
  height: 100%;
  min-height: 0;
  &[hidden] {
    display: none;
  }
`;

const inlineErrorStyle = css`
  position: relative;
  inset: auto;
  max-height: 100%;
  overflow-y: auto;
`;
