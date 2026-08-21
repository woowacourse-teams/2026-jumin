import { css } from '@emotion/css';
import { Navigate, useLocation, useNavigate } from 'react-router';

import type { ParkingLotSummary, ParkingSearchResponse } from '../../../api/contracts';
import { SearchConditionBar } from '../../../shared/components/SearchConditionBar';
import { InfoCard } from './components/InfoCard';
import { useState } from 'react';
import BottomSheet, { type BottomSheetSnap } from '../../../shared/components/BottomSheet';
import { InfoRow } from './components/InfoRow';

const CARD_WIDTH = 300;
const CARD_GAP = 12;
const CARD_STEP = CARD_WIDTH + CARD_GAP;

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

// 유형별 추천 주차장 가져오는 메서드
export const getTopRecommendations = (parkingLots: ParkingLotSummary[], type: RecommendationType, limit = 3) => {
  const availableLots = [...parkingLots].filter((parkingLot) => {
    if (parkingLot.availabilityStatus !== 'AVAILABLE') return false;

    return getSortValue(parkingLot, type) !== null;
  });

  return availableLots
    .sort((first, second) => {
      const firstValue = getSortValue(first, type) ?? Number.POSITIVE_INFINITY;
      const secondValue = getSortValue(second, type) ?? Number.POSITIVE_INFINITY;

      return firstValue - secondValue || first.distanceMeters - second.distanceMeters || first.id - second.id;
    })
    .slice(0, limit);
};

// 유형별 더보기 주차장 가져오는 메서드
export const sortParkingLots = (parkingLots: ParkingLotSummary[], type: RecommendationType) => {
  return [...parkingLots].sort((first, second) => {
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

  // 현재 추천 주차장 카드 인덱스
  const [activeCardIndex, setActiveCardIndex] = useState(0);

  // 더보기 유무와 추천 유형
  const [recommendationType, setRecommendationType] = useState<RecommendationType>('PRICE');
  const [selectedParkingLotId, setSelectedParkingLotId] = useState<number | null>(null);

  const [sheetSnap, setSheetSnap] = useState<BottomSheetSnap>('collapsed');

  const handleCardScroll = (event: React.UIEvent<HTMLUListElement>) => {
    const nextIndex = Math.round(event.currentTarget.scrollLeft / CARD_STEP);

    setActiveCardIndex(nextIndex);
  };

  // 이전 페이지에서 state 가져오기
  const { state } = useLocation();
  const recommendationState = state as NavigationState | null;
  if (!recommendationState?.searchCondition || !recommendationState.searchResult) {
    return <Navigate to="/parkingTimeSheet" replace />;
  }
  const { searchCondition, searchResult } = recommendationState;

  // 추천 유형과 필터링 된 주차장 목록
  const recommendedParkingLots = getTopRecommendations(searchResult.parkingLots, recommendationType);
  // 더보기 주차장 목록
  const parkingLots = sortParkingLots(searchResult.parkingLots, recommendationType);
  const activeParkingLotId = selectedParkingLotId ?? parkingLots[0]?.id ?? null;

  const handleParkingLotDetail = (parkingLot: ParkingLotSummary) => {
    navigate('/parkingDetail', {
      state: {
        parkingLot,
      },
    });
  };

  return (
    <main className={pageStyle}>
      <SearchConditionBar
        destinationName={searchCondition.destinationName}
        entryAt={searchCondition.entryAt}
        exitAt={searchCondition.exitAt}
      />

      <section className={recommendationSectionStyle} aria-label="가격순 추천 주차장">
        {recommendedParkingLots.length > 0 ? (
          <ul className={cardListStyle} onScroll={handleCardScroll}>
            {recommendedParkingLots.map((parkingLot, index) => (
              <li className={cardItemStyle} key={parkingLot.id}>
                <InfoCard
                  parkingLot={parkingLot}
                  description={getRecommendationMessage(recommendationType, index + 1)}
                  onNavigate={handleParkingLotDetail}
                  isActive={activeCardIndex === index}
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
                  onClick={() => setRecommendationType(type)}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {parkingLots.length > 0 ? (
            <ul className={parkingListStyle} onDragStart={(event) => event.preventDefault()}>
              {parkingLots.map((parkingLot) => (
                <li className={parkingItemStyle} key={parkingLot.id}>
                  <InfoRow
                    parkingLot={parkingLot}
                    isActive={activeParkingLotId === parkingLot.id}
                    onSelect={(selectedParkingLot) => setSelectedParkingLotId(selectedParkingLot.id)}
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
