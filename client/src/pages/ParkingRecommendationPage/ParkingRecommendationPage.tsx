import { NaverMap } from '../../../shared/components/NaverMap';

import { css } from '@emotion/css';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { ParkingLotSummary, ParkingSearchResponse } from '../../../api/contracts';
import { SearchConditionBar } from '../../../shared/components/SearchConditionBar';
import { InfoCard } from './components/InfoCard';
import BottomSheet, { type BottomSheetSnap } from '../../../shared/components/BottomSheet';
import { InfoRow } from './components/InfoRow';
import { trackEvent } from '../../../shared/analytics';

const CARD_WIDTH = 300;
const CARD_GAP = 12;

const getHorizontalCenterOffset = (container: HTMLElement, item: Element) => {
  const containerRect = container.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();

  const containerCenter = containerRect.left + containerRect.width / 2;
  const itemCenter = itemRect.left + itemRect.width / 2;

  return itemCenter - containerCenter;
};

interface NavigationState {
  searchCondition?: {
    destinationName: string;
    destinationLatitude: number;
    destinationLongitude: number;
    entryAt: string;
    exitAt: string;
  };
  searchResult?: ParkingSearchResponse;
}

// 추천 유형
export type RecommendationType = 'PRICE' | 'DISTANCE' | 'BALANCED';
// 추천 유형별 라벨
export const recommendationLabels: Record<RecommendationType, string> = {
  DISTANCE: '거리순',
  PRICE: '가격순',
  BALANCED: '균형순',
};

// 추천 유형 null 검사
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

// 추천에 따른 부연 설명
export const getRecommendationMessage = (type: RecommendationType, rank: number) => {
  if (type === 'PRICE') {
    return rank === 1 ? '설정한 조건에서 제일 저렴해요' : `가격이 ${rank}번째로 저렴해요`;
  }

  if (type === 'DISTANCE') {
    return rank === 1 ? '목적지에서 가장 가까워요' : `목적지에서 ${rank}번째로 가까워요`;
  }

  return `거리와 가격의 균형 ${rank}위예요`;
};

// 유형별 활성 주차장 목록을 가져오는 메서드
export const sortParkingLots = (parkingLots: ParkingLotSummary[], type: RecommendationType) => {
  return [...parkingLots]
    .filter((parkingLot) => parkingLot.availabilityStatus === 'AVAILABLE')
    .sort((first, second) => {
      const firstValue = getSortValue(first, type) ?? Number.POSITIVE_INFINITY;

      const secondValue = getSortValue(second, type) ?? Number.POSITIVE_INFINITY;

      return firstValue - secondValue || first.distanceMeters - second.distanceMeters || first.id - second.id;
    });
};

// 더보기 주차장 시 필터 옵션
const filterOptions: {
  type: RecommendationType;
  label: string;
}[] = [
  { type: 'DISTANCE', label: '거리순' },
  { type: 'PRICE', label: '가격순' },
  { type: 'BALANCED', label: '균형순' },
];

export function ParkingRecommendationPage() {
  const navigate = useNavigate();
  const cardListRef = useRef<HTMLUListElement>(null);
  const parkingListRef = useRef<HTMLUListElement>(null);

  // 더보기 유무와 추천 유형
  const [recommendationType, setRecommendationType] = useState<RecommendationType>('DISTANCE');
  const [selectedParkingLotId, setSelectedParkingLotId] = useState<number | null>(null);

  const [sheetSnap, setSheetSnap] = useState<BottomSheetSnap>('collapsed');

  // 필터링 유형 선택
  const handleRecommendationTypeChange = (type: RecommendationType) => {
    setRecommendationType(type);
    setSelectedParkingLotId(null);
  };

  useLayoutEffect(() => {
    if (parkingListRef.current) {
      parkingListRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [recommendationType]);

  // 이전 페이지에서 state 가져오기
  const { state } = useLocation();
  const recommendationState = state as NavigationState | null;
  const parkingLots = recommendationState?.searchResult
    ? sortParkingLots(recommendationState.searchResult.parkingLots, recommendationType)
    : [];
  const recommendedParkingLots = parkingLots
    .filter((parkingLot) => getSortValue(parkingLot, recommendationType) !== null)
    .slice(0, 3);
  const hasTrackedRecommendations = useRef(false);

  useEffect(() => {
    if (hasTrackedRecommendations.current || recommendedParkingLots.length === 0) return;

    hasTrackedRecommendations.current = true;
    trackEvent('parking_recommendations_viewed');
  }, [recommendedParkingLots.length]);

  if (!recommendationState?.searchCondition || !recommendationState.searchResult) {
    return <Navigate to="/parkingTimeSheet" replace />;
  }
  const { searchCondition } = recommendationState;

  const activeParkingLotId = selectedParkingLotId ?? parkingLots[0]?.id ?? null;

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
      setSelectedParkingLotId(centeredParkingLot.id);
    }
  };

  const handleParkingLotSelect = (parkingLot: ParkingLotSummary) => {
    setSelectedParkingLotId(parkingLot.id);

    const recommendationIndex = recommendedParkingLots.findIndex(
      (recommendedParkingLot) => recommendedParkingLot.id === parkingLot.id,
    );
    const cardList = cardListRef.current;
    const recommendationCard = recommendationIndex >= 0 ? cardList?.children.item(recommendationIndex) : null;

    if (cardList && recommendationCard) {
      const centerOffset = getHorizontalCenterOffset(cardList, recommendationCard);

      if (Math.abs(centerOffset) > 1) {
        cardList.scrollBy({ left: centerOffset, behavior: 'smooth' });
      }
    }
  };

  const handleParkingLotDetail = (parkingLot: ParkingLotSummary) => {
    navigate('/parkingDetail', {
      state: {
        parkingLot,
        searchCondition,
      },
    });
  };

  return (
    <main className={pageStyle}>
      <NaverMap latitude={searchCondition.destinationLatitude} longitude={searchCondition.destinationLongitude} />
      <SearchConditionBar
        destinationName={searchCondition.destinationName}
        entryAt={searchCondition.entryAt}
        exitAt={searchCondition.exitAt}
      />

      <section
        className={recommendationSectionStyle}
        aria-label={`${recommendationLabels[recommendationType]} 추천 주차장`}
      >
        {recommendedParkingLots.length > 0 ? (
          <ul key={recommendationType} ref={cardListRef} className={cardListStyle} onScroll={handleCardScroll}>
            {recommendedParkingLots.map((parkingLot, index) => (
              <li className={cardItemStyle} key={parkingLot.id}>
                <InfoCard
                  parkingLot={parkingLot}
                  description={getRecommendationMessage(recommendationType, index + 1)}
                  onNavigate={handleParkingLotDetail}
                  isActive={activeParkingLotId === parkingLot.id}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className={emptyMessageStyle}>추천할 수 있는 주차장이 없습니다.</p>
        )}
      </section>

      <BottomSheet snap={sheetSnap} onSnapChange={setSheetSnap}>
        <section id="parking-list-sheet" className={sheetContentStyle} aria-label="주차장 전체 목록">
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
            <ul ref={parkingListRef} className={parkingListStyle} onDragStart={(event) => event.preventDefault()}>
              {parkingLots.map((parkingLot) => (
                <li className={parkingItemStyle} key={parkingLot.id}>
                  <InfoRow
                    parkingLot={parkingLot}
                    isActive={activeParkingLotId === parkingLot.id}
                    onSelect={handleParkingLotSelect}
                    onNavigate={handleParkingLotDetail}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className={emptyMessageStyle}>조회된 주차장이 없습니다.</p>
          )}
        </section>
      </BottomSheet>
    </main>
  );
}

const pageStyle = css`
  position: relative;

  width: 100%;
  height: 100%;
  overflow: hidden;
`;

const recommendationSectionStyle = css`
  position: absolute;

  right: 0;
  bottom: 114px;
  left: 0;
  z-index: 5;

  background: transparent;
`;

const cardListStyle = css`
  display: flex;
  gap: ${CARD_GAP}px;

  margin: 0;
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
  flex: 0 0 300px;

  scroll-snap-align: start;
`;

const emptyMessageStyle = css`
  margin: 12px 16px 18px;
  padding: 24px;

  color: #697386;
  text-align: center;

  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 6px 18px rgb(16 27 55 / 10%);
`;

const filterStyle = css`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;

  margin-top: 10px;
  margin-bottom: 18px;
`;

const filterButtonStyle = (isSelected: boolean) => css`
  height: 42px;
  padding: 0 12px;

  color: ${isSelected ? '#ffffff' : '#2463d4'};
  font-size: 14px;
  font-weight: 700;

  background: ${isSelected ? '#4356d8' : '#edf3ff'};
  border: 0;
  border-radius: 12px;
  appearance: none;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 30%);
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
