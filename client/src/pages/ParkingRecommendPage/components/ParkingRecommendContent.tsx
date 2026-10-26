import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';

import { css } from '@emotion/css';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router';

import type { ParkingLotSummary } from '../../../../api/contracts';
import { parkingSearchQueryOptions } from '../../../../api/queries/parkingSearchQuery';
import { trackEvent } from '../../../../shared/analytics';
import BottomSheet, { BOTTOM_SHEET_HEIGHT } from '../../../../shared/components/ui/BottomSheet';
import { InfoCard } from './InfoCard';
import { InfoRow } from './InfoRow';
import type {
  ParkingDetailCondition,
  ParkingSearchCondition,
  RecommendationType,
} from '../../../../shared/types/navigation';
import { ParkingMarkers } from './ParkingMarkers';
import { useMapClick } from '../../../../shared/hooks/useMapClick';
import { eventName } from '../../../../shared/monitoring/constants';
import { useParkingRecommendView } from '../hooks/useParkingRecommendView';
import { useParkingRecommendScrollRestore } from '../hooks/useParkingRecommendScrollRestore';
import { DeepLinkModal } from '../../../../shared/components/service/directions/DeepLinkModal';
import { saveRecentParkingUse } from '../../../../shared/utils/recentParkingUses';
import { color } from '../../../theme/color';
import { typography } from '../../../theme/typography';
import { getMapCenterForMarkerY } from '../../../../shared/maps/getMapCenterForMarkerY';

type MapOutletContext = {
  map: naver.maps.Map | null;
};

interface Props {
  searchCondition: ParkingSearchCondition;
  conditionBarRef: RefObject<HTMLElement | null>;
}

const CARD_WIDTH = 300;
const CARD_GAP = 12;

const recommendationLabels: Record<RecommendationType, string> = {
  DISTANCE: '거리순',
  PRICE: '가격순',
  BALANCED: '균형순',
};

const filterOptions: Array<{
  type: RecommendationType;
  label: string;
}> = [
  { type: 'DISTANCE', label: '거리순' },
  { type: 'PRICE', label: '가격순' },
  { type: 'BALANCED', label: '균형순' },
];

const getSortValue = (parkingLot: ParkingLotSummary, type: RecommendationType) => {
  switch (type) {
    case 'DISTANCE':
      return parkingLot.distanceMeters;

    case 'PRICE':
      return parkingLot.estimatedFee;

    case 'BALANCED':
      return parkingLot.balancedScore;
  }
};

const sortParkingLots = (parkingLots: ParkingLotSummary[], type: RecommendationType) =>
  [...parkingLots].sort((first, second) => {
    const firstValue = getSortValue(first, type) ?? Number.POSITIVE_INFINITY;
    const secondValue = getSortValue(second, type) ?? Number.POSITIVE_INFINITY;

    const firstDistance = first.distanceMeters ?? Number.POSITIVE_INFINITY;
    const secondDistance = second.distanceMeters ?? Number.POSITIVE_INFINITY;

    return firstValue - secondValue || firstDistance - secondDistance || first.id - second.id;
  });

const getRecommendationMessage = (type: RecommendationType, rank: number) => {
  if (type === 'PRICE') {
    return rank === 1 ? '설정한 조건에서 제일 저렴해요' : `가격이 ${rank}번째로 저렴해요`;
  }

  if (type === 'DISTANCE') {
    return rank === 1 ? '목적지에서 가장 가까워요' : `목적지에서 ${rank}번째로 가까워요`;
  }

  return `거리와 가격의 균형 ${rank}위예요`;
};

const getHorizontalCenterOffset = (container: HTMLElement, item: Element) => {
  const containerRect = container.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();

  return itemRect.left + itemRect.width / 2 - (containerRect.left + containerRect.width / 2);
};

export const ParkingRecommendContent = ({ searchCondition, conditionBarRef }: Props) => {
  const { data } = useSuspenseQuery(parkingSearchQueryOptions(searchCondition));
  const [directionsParkingLot, setDirectionsParkingLot] = useState<ParkingLotSummary | null>(null);

  const cardListRef = useRef<HTMLUListElement>(null);
  const parkingListRef = useRef<HTMLUListElement>(null);
  const hasTrackedRecommendations = useRef(false);

  const { map } = useOutletContext<MapOutletContext>();
  const { view, savedView, updateView, openDetail } = useParkingRecommendView(searchCondition);
  const { recommendationType, parkingLotId: selectedParkingLotId, snap: sheetSnap } = view;

  const collapseBottomSheet = useCallback(() => {
    updateView({ snap: 'collapsed' });
  }, [updateView]);

  useMapClick({
    map,
    enabled: sheetSnap === 'expanded',
    onMapClick: collapseBottomSheet,
  });

  const parkingLots = useMemo(
    () => sortParkingLots(data.parkingLots, recommendationType),
    [data.parkingLots, recommendationType],
  );

  const recommendedParkingLots = useMemo(
    () =>
      parkingLots
        .filter((parkingLot) => getSortValue(parkingLot, recommendationType) !== null)
        .slice(0, 3),
    [parkingLots, recommendationType],
  );

  const activeParkingLotId = selectedParkingLotId ?? parkingLots[0]?.id ?? null;

  useEffect(() => {
    // 지도 생성 전이거나 활성화된 주차장이 없으면 카메라를 이동하지 않는다.
    if (!map || activeParkingLotId === null) return;

    // 현재 선택되었거나 기본으로 활성화된 주차장을 찾는다.
    const activeParkingLot = parkingLots.find((parkingLot) => parkingLot.id === activeParkingLotId);

    if (!activeParkingLot) return;

    // 활성 주차장의 위·경도를 네이버 지도 좌표 객체로 변환한다.
    const position = new naver.maps.LatLng(
      activeParkingLot.location.latitude,
      activeParkingLot.location.longitude,
    );

    // 바텀시트가 접혀 있으면 가리는 영역이 작으므로
    // 활성 주차장을 지도 중앙으로 이동시킨다.
    if (sheetSnap === 'collapsed') {
      map.panTo(position);
      return;
    }

    // Page에서 전달받은 ref로 이 화면의 검색 조건 바를 직접 찾는다.
    const conditionBar = conditionBarRef.current;
    if (!conditionBar) return;

    // getBoundingClientRect는 브라우저 화면 기준이므로 지도 상단을 빼서 지도 내부 좌표로 맞춘다.
    const mapTop = map.getElement().getBoundingClientRect().top;
    // 검색 조건 바 바로 아래부터 펼쳐진 바텀시트 바로 위까지가 지도를 가리지 않는 영역이다.
    const visibleTop = conditionBar.getBoundingClientRect().bottom - mapTop;
    const visibleBottom = map.getSize().height - BOTTOM_SHEET_HEIGHT;
    // 이 영역의 세로 중앙에 선택한 마커가 보이도록 목표 높이를 정한다.
    const targetY = (visibleTop + visibleBottom) / 2;
    // 목표 높이에 맞는 지도 중심 계산은 홈 화면과 동일한 공통 함수를 사용한다.
    const center = getMapCenterForMarkerY(map, position, targetY);

    map.panTo(center, { duration: 300 });
  }, [activeParkingLotId, map, parkingLots, sheetSnap, conditionBarRef]);

  useLayoutEffect(() => {
    parkingListRef.current?.scrollTo({
      top: 0,
      behavior: 'auto',
    });
  }, [recommendationType]);

  useEffect(() => {
    if (hasTrackedRecommendations.current || recommendedParkingLots.length === 0) {
      return;
    }

    hasTrackedRecommendations.current = true;
    trackEvent(eventName.PARKING_RECOMMENDATION_VIEWED);
  }, [recommendedParkingLots.length]);

  const handleRecommendationTypeChange = (type: RecommendationType) => {
    updateView({ recommendationType: type, parkingLotId: null });
  };

  useParkingRecommendScrollRestore({
    savedView,
    cardListRef,
    parkingListRef,
    recommendedParkingLots,
    parkingLots,
  });

  const handleParkingLotSelect = (parkingLot: ParkingLotSummary) => {
    const isRecommended = recommendedParkingLots.some(({ id }) => id === parkingLot.id);

    updateView({
      parkingLotId: parkingLot.id,
      snap: isRecommended ? sheetSnap : 'expanded',
    });

    const index = parkingLots.findIndex(({ id }) => id === parkingLot.id);
    const list = parkingListRef.current;
    const row = index >= 0 ? list?.children.item(index) : null;

    if (list && row) {
      const listRect = list.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const offset =
        rowRect.top < listRect.top
          ? rowRect.top - listRect.top
          : rowRect.bottom > listRect.bottom
            ? rowRect.bottom - listRect.bottom
            : 0;

      if (offset !== 0) {
        list.scrollBy({ top: offset, behavior: 'smooth' });
      }
    }

    const recommendationIndex = recommendedParkingLots.findIndex(
      (recommendedParkingLot) => recommendedParkingLot.id === parkingLot.id,
    );

    const cardList = cardListRef.current;
    const recommendationCard =
      recommendationIndex >= 0 ? cardList?.children.item(recommendationIndex) : null;

    if (!cardList || !recommendationCard) return;

    const centerOffset = getHorizontalCenterOffset(cardList, recommendationCard);

    if (Math.abs(centerOffset) > 1) {
      cardList.scrollBy({
        left: centerOffset,
        behavior: 'smooth',
      });
    }
  };

  const handleCardScroll = (event: React.UIEvent<HTMLUListElement>) => {
    const cardList = event.currentTarget;
    const cards = Array.from(cardList.children);

    if (cards.length === 0) return;

    const nextIndex = cards.reduce((closestIndex, card, index) => {
      const closestDistance = Math.abs(getHorizontalCenterOffset(cardList, cards[closestIndex]!));

      const currentDistance = Math.abs(getHorizontalCenterOffset(cardList, card));

      return currentDistance < closestDistance ? index : closestIndex;
    }, 0);

    const centeredParkingLot = recommendedParkingLots[nextIndex];

    if (centeredParkingLot) {
      updateView({ parkingLotId: centeredParkingLot.id });
    }
  };

  const handleParkingLotDetail = (parkingLot: ParkingLotSummary) => {
    const detailCondition: ParkingDetailCondition = {
      parkingLotId: parkingLot.id,
      parkingLotName: parkingLot.name,
      destinationName: searchCondition.destinationName,
      destinationLatitude: searchCondition.destinationLatitude,
      destinationLongitude: searchCondition.destinationLongitude,
      entryAt: searchCondition.entryAt,
      exitAt: searchCondition.exitAt,
    };

    openDetail(detailCondition);
  };

  const handleParkingLotDirections = (parkingLot: ParkingLotSummary) => {
    trackEvent(eventName.RECOMMEND_DIRECTIONS_BUTTON);
    setDirectionsParkingLot(parkingLot);
  };

  return (
    <>
      <ParkingMarkers
        map={map}
        destination={{
          name: searchCondition.destinationName,
          latitude: searchCondition.destinationLatitude,
          longitude: searchCondition.destinationLongitude,
        }}
        parkingLots={parkingLots}
        recommendedParkingLots={recommendedParkingLots}
        selectedParkingLotId={activeParkingLotId}
        onSelect={handleParkingLotSelect}
      />
      <section
        className={recommendationSectionStyle}
        aria-label={`${recommendationLabels[recommendationType]} 추천 주차장`}
      >
        {recommendedParkingLots.length > 0 ? (
          <ul
            key={recommendationType}
            ref={cardListRef}
            className={cardListStyle}
            onScrollEnd={handleCardScroll}
          >
            {recommendedParkingLots.map((parkingLot, index) => (
              <li className={cardItemStyle} key={parkingLot.id}>
                <InfoCard
                  parkingLot={parkingLot}
                  description={getRecommendationMessage(recommendationType, index + 1)}
                  isActive={activeParkingLotId === parkingLot.id}
                  onNavigate={handleParkingLotDetail}
                  onDirections={handleParkingLotDirections}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className={emptyMessageStyle}>추천할 수 있는 주차장이 없습니다.</p>
        )}
      </section>

      <BottomSheet snap={sheetSnap} onSnapChange={(snap) => updateView({ snap })}>
        <section
          id="parking-list-sheet"
          className={sheetContentStyle}
          aria-label="주차장 전체 목록"
        >
          <div className={filterStyle} role="tablist" aria-label="주차장 정렬 기준">
            {filterOptions.map(({ type, label }) => {
              const isSelected = recommendationType === type;

              return (
                <button
                  key={type}
                  className={filterButtonStyle(isSelected)}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => handleRecommendationTypeChange(type)}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {parkingLots.length > 0 ? (
            <ul
              ref={parkingListRef}
              className={parkingListStyle}
              onDragStart={(event) => event.preventDefault()}
            >
              {parkingLots.map((parkingLot) => (
                <li className={parkingItemStyle} key={parkingLot.id}>
                  <InfoRow
                    parkingLot={parkingLot}
                    isActive={activeParkingLotId === parkingLot.id}
                    onSelect={handleParkingLotSelect}
                    onNavigate={handleParkingLotDetail}
                    onDirections={handleParkingLotDirections}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className={emptyMessageStyle}>조회된 주차장이 없습니다.</p>
          )}
        </section>
      </BottomSheet>
      {directionsParkingLot && (
        <DeepLinkModal
          onRequestClose={() => setDirectionsParkingLot(null)}
          onDirectionsStart={() => saveRecentParkingUse(directionsParkingLot)}
          destination={{ name: directionsParkingLot.name, location: directionsParkingLot.location }}
        />
      )}
    </>
  );
};

const recommendationSectionStyle = css`
  position: absolute;
  pointer-events: auto;

  right: 0;
  bottom: 114px;
  left: 0;
  z-index: 5;

  background: transparent;
`;

const cardListStyle = css`
  display: flex;
  gap: ${CARD_GAP}px;

  padding: 0 calc((100% - ${CARD_WIDTH}px) / 2);

  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-padding-inline: calc((100% - ${CARD_WIDTH}px) / 2);

  list-style: none;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const cardItemStyle = css`
  flex: 0 0 ${CARD_WIDTH}px;

  scroll-snap-align: start;
`;

const emptyMessageStyle = css`
  margin: 12px 16px 18px;
  padding: 24px;

  ${typography.body};
  color: ${color.text.secondary};
  text-align: center;

  background: ${color.background.default};
  border-radius: 20px;
  box-shadow: 0 6px 18px rgb(16 27 55 / 10%);
`;

const filterStyle = css`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;

  margin-top: 10px;
  margin-bottom: 50px;
`;

const filterButtonStyle = (isSelected: boolean) => css`
  height: 42px;
  padding: 0 12px;

  ${typography.label};
  color: ${isSelected ? color.text.inverse : color.text.brand};

  background: ${isSelected ? color.background.selected : color.background.brandSubtle};
  border: 0;
  border-radius: 12px;
  appearance: none;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;

  &:hover {
    background: ${isSelected ? color.background.brandHovered : color.background.brandSubtleHovered};
  }

  &:active {
    background: ${isSelected ? color.background.brandPressed : color.background.brandSubtlePressed};
  }

  &:focus-visible {
    outline: 3px solid ${color.focus.ring};
    outline-offset: 2px;
  }
`;

const sheetContentStyle = css`
  display: flex;
  flex-direction: column;

  height: 100%;
  min-height: 0;
`;

const parkingListStyle = css`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;

  min-height: 0;
  margin: 0;
  padding: 0;
  overflow-y: auto;

  list-style: none;
  overscroll-behavior: contain;
  user-select: none;
  -webkit-user-drag: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;

  & * {
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
  }
`;

const parkingItemStyle = css`
  flex-shrink: 0;
`;
