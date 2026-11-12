import { Stack } from '../../../shared/components/ui/Stack';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { css } from '@emotion/css';
import type { ParkingLotSummary } from '../../../api/contracts';
import { trackEvent } from '../../../shared/analytics';
import { DeepLinkModal } from '../../../shared/components/service/directions/DeepLinkModal';
import { eventName } from '../../../shared/monitoring/constants';
import type { BottomSheetSnap } from '../../../shared/components/ui/BottomSheet';
import { saveRecentParkingUse } from '../../../shared/utils/recentParkingUses';
import { color } from '../../../theme/color';
import { duration, durationMs, easing } from '../../../theme/motion';
import { typography } from '../../../theme/typography';
import type { RecommendationType } from '../types/recommendation';
import { getRecommendationMessage } from '../utils/recommendationPolicy';
import { InfoCard } from './InfoCard';
import { InfoRow } from './InfoRow';

const filterOptions: Array<{ type: RecommendationType; label: string }> = [
  { type: 'BALANCED', label: '추천순' },
  { type: 'DISTANCE', label: '거리순' },
  { type: 'PRICE', label: '가격순' },
];

/**
 * 정렬 기준이 바뀌면 각 항목을 이전 자리에서 새 자리로 미끄러지게 한다.
 * 순위가 어떻게 바뀌었는지 눈으로 따라갈 수 있게 하기 위한 전환이다.
 */
const useReorderTransition = (
  listRef: React.RefObject<HTMLUListElement | null>,
  recommendationType: RecommendationType,
) => {
  const previousTops = useRef(new Map<string, number>());
  const previousType = useRef(recommendationType);

  useLayoutEffect(() => {
    const items = Array.from(listRef.current?.children ?? []) as HTMLElement[];
    const isTypeChanged = previousType.current !== recommendationType;
    const reducesMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nextTops = new Map<string, number>();

    items.forEach((item) => {
      const id = item.dataset.parkingLotId;
      if (!id) return;

      const top = item.offsetTop;
      const previousTop = previousTops.current.get(id);
      nextTops.set(id, top);

      if (!isTypeChanged || reducesMotion || previousTop === undefined || previousTop === top) {
        return;
      }
      if (typeof item.animate !== 'function') return;

      item.animate([{ transform: `translateY(${previousTop - top}px)` }, { transform: 'none' }], {
        duration: durationMs.slow,
        easing: easing.inOut,
      });
    });

    previousTops.current = nextTops;
    previousType.current = recommendationType;
  });
};

interface Props {
  parkingLots: ParkingLotSummary[];
  recommendedCount: number;
  /** 카드의 도보 거리 막대가 기준으로 삼는 검색 반경(m). */
  searchRadiusMeters: number;
  recommendationType: RecommendationType;
  selectedParkingLot: ParkingLotSummary | null;
  isActive: boolean;
  sheetSnap: BottomSheetSnap;
  onTypeChange: (type: RecommendationType) => void;
  onSelect: (parkingLot: ParkingLotSummary) => void;
  onDetail: (parkingLot: ParkingLotSummary) => void;
}

/** 목록 표시, 선택 항목의 스크롤, 목록에서 시작하는 길찾기를 담당한다. */
export const ParkingRecommendContent = ({
  parkingLots,
  recommendedCount,
  searchRadiusMeters,
  recommendationType,
  selectedParkingLot,
  isActive,
  sheetSnap,
  onTypeChange,
  onSelect,
  onDetail,
}: Props) => {
  const parkingListRef = useRef<HTMLUListElement>(null);
  const selectedTypeIndex = filterOptions.findIndex(({ type }) => type === recommendationType);
  const sortGroupName = useId();
  const hasTrackedRecommendations = useRef(false);
  const [directionsParkingLot, setDirectionsParkingLot] = useState<ParkingLotSummary | null>(null);

  useLayoutEffect(() => {
    if (!isActive || sheetSnap === 'collapsed' || !selectedParkingLot) return;

    const list = parkingListRef.current;
    const index = parkingLots.findIndex(({ id }) => id === selectedParkingLot.id);
    const item = index >= 0 ? list?.children.item(index) : null;
    if (!list || !item) return;

    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const offset =
      itemRect.top < listRect.top
        ? itemRect.top - listRect.top
        : itemRect.bottom > listRect.bottom
          ? itemRect.bottom - listRect.bottom
          : 0;
    if (offset !== 0) list.scrollBy({ top: offset, behavior: 'auto' });
  }, [isActive, sheetSnap, selectedParkingLot, parkingLots]);

  // 선택 항목의 스크롤 보정이 끝난 뒤에 실행해야 한다.
  // 먼저 실행하면 이동 중인 항목의 위치를 기준으로 목록이 엉뚱한 곳으로 스크롤된다.
  useReorderTransition(parkingListRef, recommendationType);

  useEffect(() => {
    if (hasTrackedRecommendations.current || recommendedCount === 0) return;
    hasTrackedRecommendations.current = true;
    trackEvent(eventName.PARKING_RECOMMENDATION_VIEWED);
  }, [recommendedCount]);

  const handleDirections = (parkingLot: ParkingLotSummary) => {
    trackEvent(eventName.RECOMMEND_DIRECTIONS_BUTTON);
    setDirectionsParkingLot(parkingLot);
  };

  return (
    <Stack as="section" className={sheetContentStyle} aria-label="주차장 전체 목록">
      <div
        className={filterStyle}
        role="radiogroup"
        aria-label="주차장 정렬 기준"
        style={{ '--selected-index': selectedTypeIndex } as CSSProperties}
      >
        {filterOptions.map(({ type, label }) => (
          <label key={type} className={filterButtonStyle(recommendationType === type)}>
            <input
              className={filterInputStyle}
              type="radio"
              name={sortGroupName}
              value={type}
              checked={recommendationType === type}
              onChange={() => {
                parkingListRef.current?.scrollTo({ top: 0 });
                onTypeChange(type);
              }}
            />
            {label}
          </label>
        ))}
        <span className={filterIndicatorStyle} aria-hidden="true" />
      </div>
      {recommendedCount === 0 && parkingLots.length > 0 && (
        <p className={emptyMessageStyle}>추천할 수 있는 주차장이 없습니다.</p>
      )}
      {parkingLots.length > 0 ? (
        <ul ref={parkingListRef} className={parkingListStyle} inert={sheetSnap === 'collapsed'}>
          {parkingLots.map((parkingLot, index) => (
            <li
              className={parkingItemStyle}
              key={parkingLot.id}
              data-parking-lot-id={parkingLot.id}
            >
              {index === 0 && recommendedCount > 0 && (
                <h2 className={sectionTitleStyle}>추천 주차장 {recommendedCount}곳</h2>
              )}
              {index === recommendedCount && (
                <h2 className={sectionTitleStyle}>
                  더보기 주차장 {parkingLots.length - recommendedCount}곳
                </h2>
              )}
              {index < recommendedCount ? (
                <InfoCard
                  parkingLot={parkingLot}
                  rank={index + 1}
                  searchRadiusMeters={searchRadiusMeters}
                  description={getRecommendationMessage(recommendationType, index + 1)}
                  isActive={selectedParkingLot?.id === parkingLot.id}
                  onSelect={onSelect}
                  onNavigate={onDetail}
                  onDirections={handleDirections}
                />
              ) : (
                <InfoRow
                  parkingLot={parkingLot}
                  isActive={selectedParkingLot?.id === parkingLot.id}
                  onSelect={onSelect}
                  onNavigate={onDetail}
                  onDirections={handleDirections}
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={emptyMessageStyle}>조회된 주차장이 없습니다.</p>
      )}
      {directionsParkingLot && isActive && (
        <DeepLinkModal
          onRequestClose={() => setDirectionsParkingLot(null)}
          onDirectionsStart={() => saveRecentParkingUse(directionsParkingLot)}
          destination={{ name: directionsParkingLot.name, location: directionsParkingLot.location }}
        />
      )}
    </Stack>
  );
};

const sheetContentStyle = css`
  height: 100%;
`;

const filterStyle = css`
  position: relative;
  display: grid;
  grid-template-columns: repeat(${filterOptions.length}, 1fr);
  flex-shrink: 0;
  margin: 0 0 6px;
  border-bottom: 2px solid ${color.border.default};
`;

const filterButtonStyle = (isSelected: boolean) => css`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  padding: 0 12px;
  ${typography.bodyStrong};
  color: ${isSelected ? color.text.primary : color.text.secondary};
  border-radius: 12px 12px 0 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    color ${duration.fast} ${easing.out},
    background-color ${duration.fast} ${easing.out};

  &:active {
    background: ${color.background.pressed};
  }
  &:has(input:focus-visible) {
    outline: var(--focus-ring-width) solid var(--focus-ring-color);
    outline-offset: var(--focus-ring-offset);
  }
`;

/** 선택한 정렬 기준 아래의 표시선. 기준을 바꾸면 그 자리로 밀려 이동한다. */
const filterIndicatorStyle = css`
  position: absolute;
  bottom: -2px;
  left: 0;
  width: calc(100% / ${filterOptions.length});
  height: 3px;
  background: ${color.background.selected};
  border-radius: 3px;
  transform: translateX(calc(var(--selected-index, 0) * 100%));
  transition: transform ${duration.slow} ${easing.inOut};
  pointer-events: none;
`;

const filterInputStyle = css`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
`;

const parkingListStyle = css`
  flex: 1;
  min-height: 0;
  /* 배경은 시트 양끝까지 채우고, 항목의 내용에는 시트와 같은 여백을 한 번만 적용한다. */
  margin: 0 calc(-1 * var(--bottom-sheet-content-padding-x));
  padding: 0;
  overflow-y: auto;
  list-style: none;
  overscroll-behavior: contain;
`;

/* 행 안쪽 여백(10~12px)과 합쳐 시트의 좌우 여백과 같은 선에 내용이 놓이게 한다. */
const parkingItemStyle = css`
  padding: 0 calc(var(--bottom-sheet-content-padding-x) - 12px) 2px;
  background: ${color.background.default};
`;

const sectionTitleStyle = css`
  margin: 0;
  padding: 14px 12px 4px;
  ${typography.bodyStrong};
  color: ${color.text.primary};
`;

const emptyMessageStyle = css`
  margin: 12px 0;
  padding: 24px 0;
  ${typography.body};
  color: ${color.text.secondary};
  text-align: center;
`;
