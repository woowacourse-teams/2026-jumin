import { css } from '@emotion/css';
import { Navigate, useLocation, useNavigate } from 'react-router';

import type { ParkingLotSummary, ParkingSearchResponse } from '../../../api/contracts';
import { SearchConditionBar } from '../../../shared/components/SearchConditionBar';
import { BottomNav } from '../../../shared/components/BottomNav';
import { InfoCard } from './components/InfoCard';
import { useState } from 'react';

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

export function ParkingRecommendationPage() {
  const navigate = useNavigate();

  const [activeCardIndex, setActiveCardIndex] = useState(0);

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

  // 추천 유형과 필터링 된 주차장 목록 계산하기
  const recommendationType: RecommendationType = 'PRICE';
  const recommendedParkingLots = getTopRecommendations(searchResult.parkingLots, recommendationType);

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
                  onNavigate={() => navigate('/parkingDetail')}
                  isActive={activeCardIndex === index}
                />
              </li>
            ))}
            <li className={moreButtonItemStyle}>
              <button className={moreButtonStyle} type="button" aria-label="주차장 목록 더보기" draggable={false}>
                +
              </button>
            </li>
          </ul>
        ) : (
          <p className={emptyMessageStyle}>추천할 수 있는 주차장이 없습니다.</p>
        )}
      </section>

      <BottomNav />
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
  bottom: 86px;
  left: 0;
  z-index: 5;

  background: transparent;
`;

const cardListStyle = css`
  display: flex;
  gap: 12px;

  margin: 0;
  padding: 12px 16px 18px;
  overflow-x: auto;
  overscroll-behavior-x: contain;

  list-style: none;
  scroll-padding-inline: 16px;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  touch-action: pan-x;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const cardItemStyle = css`
  flex: 0 0 300px;

  scroll-snap-align: start;
`;

const moreButtonItemStyle = css`
  flex: 0 0 84px;

  scroll-snap-align: end;
`;

const moreButtonStyle = css`
  display: flex;
  align-items: center;
  justify-content: center;

  width: 100%;
  height: 158px;
  padding: 0;

  color: #ffffff;
  font-size: 32px;
  font-weight: 700;
  line-height: 1;

  background: #4356d8;
  border: 0;
  border-radius: 16px;
  box-shadow: 0 6px 18px rgb(16 27 55 / 12%);
  cursor: pointer;
  user-select: none;
  -webkit-user-drag: none;

  &:hover {
    background: #4356d8;
  }

  &:active {
    transform: scale(0.98);
  }

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 35%);
    outline-offset: 3px;
  }
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
