import { css } from '@emotion/css';

import type { ParkingLotSummary } from '../../../../api/contracts';
import { trackEvent } from '../../../../shared/analytics';
import { eventName } from '../../../../shared/monitoring/constants';
import { color } from '../../../theme/color';
import { typography } from '../../../theme/typography';
import { DirectionsIcon, InformationIcon } from '../../../../shared/components/ui/icons';

interface Props {
  parkingLot: ParkingLotSummary;
  description: string;
  rank: number;
  onSelect: (parkingLot: ParkingLotSummary) => void;
  onNavigate: (parkingLot: ParkingLotSummary) => void;
  onDirections: (parkingLot: ParkingLotSummary) => void;
  isActive: boolean;
}

export const InfoCard = ({
  parkingLot,
  description,
  rank,
  onSelect,
  onNavigate,
  onDirections,
  isActive,
}: Props) => {
  const { name, estimatedFee, distanceMeters, walkingDurationMinutes } = parkingLot;

  const walkingInformation =
    walkingDurationMinutes === null || distanceMeters === null
      ? '도보 정보 없음'
      : `${distanceMeters.toLocaleString('ko-KR')}m(${walkingDurationMinutes}분)`;

  const handleDetailButtonClick = () => {
    trackEvent(eventName.RECOMMENDED_PARKING_DETAIL);
    onNavigate(parkingLot);
  };
  return (
    <article className={cardStyle(isActive)} draggable={false}>
      <button
        className={selectButtonStyle}
        type="button"
        aria-label={`${name} 선택`}
        aria-pressed={isActive}
        onClick={() => onSelect(parkingLot)}
      />
      <header className={headerStyle}>
        <h3 className={nameStyle}>{name}</h3>
        <button
          className={detailButtonStyle}
          type="button"
          aria-label={`${name} 상세정보`}
          onClick={handleDetailButtonClick}
        >
          <InformationIcon size={24} aria-hidden="true" />
        </button>
      </header>
      <p className={descriptionStyle}>
        <span className={rankStyle}>추천 {rank}위</span>
        {description}
      </p>
      <strong className={priceStyle}>
        {estimatedFee === null ? '요금 정보 없음' : `${estimatedFee.toLocaleString('ko-KR')}원`}
      </strong>

      <p className={distanceStyle}>{walkingInformation}</p>

      <button
        className={navigateButtonStyle}
        type="button"
        aria-label={`${name} 길찾기`}
        onClick={() => onDirections(parkingLot)}
      >
        <DirectionsIcon size={20} aria-hidden="true" />
        길찾기
      </button>
    </article>
  );
};

const cardStyle = (isActive: boolean) => css`
  position: relative;
  display: grid;
  grid-template-areas:
    'header header'
    'description description'
    'price button'
    'distance button';
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;

  width: 100%;
  min-height: 168px;
  padding: 14px 16px 16px;

  background: ${color.background.default};
  border: ${isActive ? '4px' : ' 2px'} solid ${color.border.brand};

  border-radius: 24px;
  box-shadow: 0 6px 18px rgb(16 27 55 / 12%);
  user-select: none;
  -webkit-user-drag: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;

  & * {
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
  }
`;

const headerStyle = css`
  position: relative;
  z-index: 1;
  pointer-events: none;
  grid-area: header;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const nameStyle = css`
  min-width: 0;
  margin: 0;
  overflow: hidden;

  ${typography.titleCard};
  color: ${color.text.primary};
  letter-spacing: -0.4px;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const descriptionStyle = css`
  grid-area: description;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  pointer-events: none;

  margin: 4px 0 12px;

  ${typography.label};
  color: ${color.text.brand};
`;

const priceStyle = css`
  grid-area: price;
  pointer-events: none;

  overflow: hidden;

  ${typography.titleSection};
  color: ${color.text.primary};
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const distanceStyle = css`
  grid-area: distance;
  pointer-events: none;

  margin: 2px 0 0;

  ${typography.bodySmall};
  color: ${color.text.secondary};
`;

const navigateButtonStyle = css`
  position: relative;
  grid-area: button;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 44px;
  margin-left: 8px;
  padding: 0 10px;

  ${typography.label};
  color: ${color.text.inverse};

  background: ${color.background.brand};
  border: 0;
  border-radius: 13px;
  cursor: pointer;

  &:hover {
    background: ${color.background.brandHovered};
  }

  &:active {
    background: ${color.background.brandPressed};
  }

  &:focus-visible {
    outline: 2px solid ${color.focus.ring};
    outline-offset: 2px;
  }

  user-select: none;
  -webkit-user-drag: none;
`;

const detailButtonStyle = css`
  pointer-events: auto;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin: -6px -6px -2px 0;
  padding: 0;
  color: ${color.icon.default};
  background: transparent;
  border: 0;
  border-radius: 13px;
  cursor: pointer;

  &:hover {
    color: ${color.icon.brand};
    background: ${color.background.brandSubtle};
  }

  &:active {
    color: ${color.icon.brand};
    background: ${color.background.brandSubtlePressed};
  }

  &:focus-visible {
    outline: 2px solid ${color.focus.ring};
    outline-offset: 2px;
  }
`;

const selectButtonStyle = css`
  position: absolute;
  inset: 0;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: inherit;
  cursor: pointer;
  &:focus-visible {
    outline: 3px solid ${color.focus.ring};
    outline-offset: -3px;
  }
`;

const rankStyle = css`
  padding: 3px 6px;
  ${typography.caption};
  color: ${color.text.brand};
  background: ${color.background.brandSubtle};
  border-radius: 6px;
`;
