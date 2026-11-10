import { Stack } from '../../../shared/components/ui/Stack';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { css } from '@emotion/css';
import type { ParkingLotSummary } from '../../../api/contracts';
import { trackEvent } from '../../../shared/analytics';
import { DeepLinkModal } from '../../../shared/components/service/directions/DeepLinkModal';
import { eventName } from '../../../shared/monitoring/constants';
import type { BottomSheetSnap } from '../../../shared/components/ui/BottomSheet';
import { saveRecentParkingUse } from '../../../shared/utils/recentParkingUses';
import { color } from '../../../theme/color';
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

interface Props {
  parkingLots: ParkingLotSummary[];
  recommendedCount: number;
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
  recommendationType,
  selectedParkingLot,
  isActive,
  sheetSnap,
  onTypeChange,
  onSelect,
  onDetail,
}: Props) => {
  const parkingListRef = useRef<HTMLUListElement>(null);
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
      <div className={filterStyle} role="radiogroup" aria-label="주차장 정렬 기준">
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
      </div>
      {recommendedCount === 0 && parkingLots.length > 0 && (
        <p className={emptyMessageStyle}>추천할 수 있는 주차장이 없습니다.</p>
      )}
      {parkingLots.length > 0 ? (
        <ul ref={parkingListRef} className={parkingListStyle} inert={sheetSnap === 'collapsed'}>
          {parkingLots.map((parkingLot, index) => (
            <li className={parkingItemStyle(index < recommendedCount)} key={parkingLot.id}>
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
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  flex-shrink: 0;
  gap: 8px;
  margin: 10px 0 16px;
`;

const filterButtonStyle = (isSelected: boolean) => css`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 42px;
  padding: 0 12px;
  ${typography.label};
  color: ${isSelected ? color.text.inverse : color.text.brand};
  background: ${isSelected ? color.background.selected : color.background.brandSubtle};
  border: 0;
  border-radius: 12px;
  cursor: pointer;
  &:hover {
    background: ${isSelected ? color.background.brandHovered : color.background.brandSubtleHovered};
  }
  &:active {
    background: ${isSelected ? color.background.brandPressed : color.background.brandSubtlePressed};
  }
  &:has(input:focus-visible) {
    outline: var(--focus-ring-width) solid var(--focus-ring-color);
    outline-offset: var(--focus-ring-offset);
  }
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

const parkingItemStyle = (isRecommended: boolean) => css`
  padding: 0 var(--bottom-sheet-content-padding-x) ${isRecommended ? '12px' : '0'};
  background: ${isRecommended ? color.background.brandSubtle : color.background.default};
`;

const sectionTitleStyle = css`
  margin: 0;
  padding: 16px 0 12px;
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
