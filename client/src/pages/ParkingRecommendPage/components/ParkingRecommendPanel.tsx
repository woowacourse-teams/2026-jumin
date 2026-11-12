import { useEffect, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { useQuery } from '@tanstack/react-query';

import type { ParkingLotSummary } from '../../../api/contracts';
import { API_ERROR_MESSAGES } from '../../../api/apiErrorMessages';
import { parkingSearchQueryOptions } from '../../../api/queries/parkingSearchQueryOptions';
import { ConditionBar } from '../../../shared/components/service/ConditionBar';
import { ErrorCard } from '../../../shared/components/service/ErrorCard';
import BottomSheet, { getBottomSheetSnapHeight } from '../../../shared/components/ui/BottomSheet';
import { useBottomSheet } from '../../../shared/hooks/useBottomSheet';
import { useMapClick } from '../../../shared/hooks/useMapClick';
import type { ParkingSearchCondition } from '../../../shared/types/navigation';
import { formatIsoDateTime } from '../../../shared/utils/formatTime';
import { ParkingRecommendSkeleton } from '../LoadingUI/ParkingRecommendSkeleton';
import type { RecommendationType } from '../types/recommendation';
import { getSortValue, sortParkingLots } from '../utils/recommendationPolicy';
import { ParkingMarkers } from './ParkingMarkers';
import { ParkingRecommendContent } from './ParkingRecommendContent';
import { ParkingRecommendDetailPanel } from './ParkingRecommendDetailPanel';
import { useVisibleMapCenter } from '../../../shared/hooks/useVisibleMapCenter';
import { WalkingRouteLine } from '../../../shared/maps/WalkingRouteLine';

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
  const recommendationSheet = useBottomSheet({ initialIsOpen: true });
  const detailSheet = useBottomSheet();

  const { conditionBarRef, getTargetMapCenter } = useVisibleMapCenter();

  // 상세 대상의 유무로 모드를 구분해 별도의 mode와 대상이 어긋나지 않게 한다.
  const isDetail = detailParkingLot !== null;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const detailTriggerRef = useRef<Element | null>(null);
  const sheet = isDetail ? detailSheet : recommendationSheet;
  const sheetSnap = sheet.snap;

  useEffect(() => {
    if (!isDetail) return;

    // 목록을 숨기기 전에 사용하던 상세 버튼으로 돌아갈 수 있도록 기억한다.
    const trigger = detailTriggerRef.current;
    titleRef.current?.focus({ preventScroll: true });

    return () => {
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, [isDetail]);

  const parkingLots = useMemo(
    () => sortParkingLots(recommendationQuery.data?.parkingLots ?? [], recommendationType),
    [recommendationQuery.data, recommendationType],
  );
  const recommendedParkingLots = useMemo(
    () => parkingLots.filter((lot) => getSortValue(lot, recommendationType) !== null).slice(0, 3),
    [parkingLots, recommendationType],
  );
  const activeParkingLot = selectedParkingLot ?? parkingLots[0] ?? null;
  // 응답의 경로는 주차장 → 목적지 순서다. 목적지에서 주차장 쪽으로 선이 뻗도록 뒤집는다.
  const activeWalkingRoute = useMemo(
    () => [...(activeParkingLot?.walkingRoute ?? [])].reverse(),
    [activeParkingLot],
  );

  useMapClick({
    map,
    enabled: sheet.isOpen && sheetSnap !== 'collapsed',
    onMapClick: () => sheet.setSnap('collapsed'),
  });

  useEffect(() => {
    if (!sheet.isOpen || !map || !activeParkingLot || sheetSnap === 'full') return;

    const mapHeight = map.getSize().height;
    const sheetHeight = getBottomSheetSnapHeight(sheetSnap, mapHeight);

    const markerLatLng = new naver.maps.LatLng(
      activeParkingLot.location.latitude,
      activeParkingLot.location.longitude,
    );

    if (isDetail) {
      // 검색 조건 바와 시트 사이에 지도 영역이 없으면 경계 계산을 생략한다.
      if (mapHeight - sheetHeight <= 136) return;
      map.fitBounds(
        [
          new naver.maps.LatLng(
            searchCondition.destinationLatitude,
            searchCondition.destinationLongitude,
          ),
          markerLatLng,
        ],
        {
          top: 112,
          right: 40,
          bottom: sheetSnap === 'collapsed' ? 124 : sheetHeight + 24,
          left: 40,
          maxZoom: 15,
        },
      );
      map.panBy(new naver.maps.Point(0, 100));
      return;
    }

    const targetMapCenter = getTargetMapCenter(map, sheetSnap, markerLatLng);
    if (!targetMapCenter) return;
    map.panTo(targetMapCenter, { duration: 300 });
  }, [
    sheet.isOpen,
    map,
    activeParkingLot,
    isDetail,
    sheetSnap,
    searchCondition,
    getTargetMapCenter,
  ]);

  const selectParkingLot = (parkingLot: ParkingLotSummary) => {
    // 같은 주차장을 다시 눌러도 사용자가 옮긴 지도를 해당 위치로 이동한다.
    setSelectedParkingLot({ ...parkingLot });
    // 이미 펼친 목록에서는 사용자가 정한 높이를 유지한다.
    sheet.setSnap((snap) => (snap === 'collapsed' ? 'medium' : snap));
  };

  const openDetail = (parkingLot: ParkingLotSummary) => {
    detailTriggerRef.current = document.activeElement;
    setSelectedParkingLot({ ...parkingLot });
    detailSheet.open(sheetSnap === 'collapsed' ? 'medium' : sheetSnap);
    setDetailParkingLot(parkingLot);
  };

  const conditionBar = (
    <ConditionBar
      elementRef={conditionBarRef}
      titleRef={titleRef}
      title={detailParkingLot?.name ?? searchCondition.destinationName}
      description={
        isDetail
          ? searchCondition.destinationName
          : `${formatIsoDateTime(searchCondition.entryAt)} - ${formatIsoDateTime(searchCondition.exitAt)}`
      }
      onBack={() => {
        if (isDetail) {
          detailSheet.close();
          setDetailParkingLot(null);
        } else {
          recommendationSheet.close();
          onBack();
        }
      }}
    />
  );

  return (
    <main className={pageStyle}>
      {sheet.isOpen && sheetSnap !== 'full' && conditionBar}
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
      <WalkingRouteLine map={map} path={activeWalkingRoute} />
      <BottomSheet
        open={sheet.isOpen}
        snap={sheetSnap}
        onSnapChange={sheet.setSnap}
        header={
          sheetSnap === 'full' ? <div className={fullHeaderStyle}>{conditionBar}</div> : undefined
        }
      >
        <div className={contentStyle} hidden={isDetail}>
          {recommendationQuery.data ? (
            <ParkingRecommendContent
              parkingLots={parkingLots}
              recommendedCount={recommendedParkingLots.length}
              searchRadiusMeters={recommendationQuery.data.searchRadiusMeters}
              recommendationType={recommendationType}
              selectedParkingLot={activeParkingLot}
              isActive={!isDetail}
              sheetSnap={recommendationSheet.snap}
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

const fullHeaderStyle = css`
  > header {
    position: static;
    margin: 0 16px 16px;
    box-shadow: none;
  }
`;
