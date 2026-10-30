import { css, cx } from '@emotion/css';

import type { ParkingLotSummary } from '../../../../api/contracts';
import { color } from '../../../theme/color';
import { typography } from '../../../theme/typography';
import {
  DirectionsIcon,
  InformationIcon,
  LocationIcon,
} from '../../../../shared/components/ui/icons';

interface Props {
  parkingLot: ParkingLotSummary;
  isActive?: boolean;
  onSelect: (parkingLot: ParkingLotSummary) => void;
  onNavigate: (parkingLot: ParkingLotSummary) => void;
  onDirections: (parkingLot: ParkingLotSummary) => void;
}

export const InfoRow = ({
  parkingLot,
  isActive = false,
  onSelect,
  onNavigate,
  onDirections,
}: Props) => {
  const { name, estimatedFee, distanceMeters, walkingDurationMinutes } = parkingLot;

  const walkingInformation =
    walkingDurationMinutes === null || distanceMeters === null
      ? '도보 정보 없음'
      : `${distanceMeters.toLocaleString('ko-KR')}m(${walkingDurationMinutes}분)`;

  return (
    <article
      className={rowStyle(isActive)}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
    >
      <button
        className={selectButtonStyle}
        type="button"
        aria-label={`${name} 선택`}
        aria-pressed={isActive}
        onClick={() => onSelect(parkingLot)}
      />

      <span className={locationIconContainerStyle} aria-hidden="true">
        <LocationIcon size={28} aria-hidden="true" />
      </span>

      <div className={informationStyle}>
        <h3 className={nameStyle}>{name}</h3>

        <p className={metadataStyle}>
          <strong>
            {estimatedFee === null ? '요금 정보 없음' : `${estimatedFee.toLocaleString('ko-KR')}원`}
          </strong>
          <span>{walkingInformation}</span>
        </p>
      </div>

      <div className={actionsStyle}>
        <button
          className={cx(actionButtonStyle, detailButtonStyle)}
          type="button"
          aria-label={`${name} 상세정보`}
          onClick={() => onNavigate(parkingLot)}
        >
          <InformationIcon size={22} aria-hidden="true" />
        </button>
        <button
          className={cx(actionButtonStyle, directionsButtonStyle)}
          type="button"
          aria-label={`${name} 길찾기`}
          onClick={() => onDirections(parkingLot)}
        >
          <DirectionsIcon size={18} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
};

const rowStyle = (isActive: boolean) => css`
  position: relative;

  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;

  width: 100%;
  min-height: 90px;
  padding: 12px 8px;

  background: ${isActive ? color.background.selectedSubtle : color.background.default};
  border: 2px solid ${isActive ? color.border.selected : 'transparent'};
  border-radius: 14px;
  user-select: none;
  -webkit-user-drag: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;

  & * {
    user-select: none;
    -webkit-user-drag: none;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
  }
`;

const selectButtonStyle = css`
  position: absolute;
  inset: 0;
  z-index: 0;

  padding: 0;

  background: transparent;
  border: 0;
  border-radius: 12px;
  appearance: none;
  cursor: pointer;
  user-select: none;
  -webkit-user-drag: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;

  &:focus-visible {
    outline: 3px solid ${color.focus.ring};
    outline-offset: -3px;
  }
`;

const informationStyle = css`
  position: relative;
  z-index: 1;

  min-width: 0;
  pointer-events: none;
`;

const locationIconContainerStyle = css`
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 58px;
  color: ${color.icon.brand};
  background: ${color.background.brandSubtle};
  border-radius: 14px;
  pointer-events: none;

  svg {
    width: 28px;
    height: 28px;
  }
`;

const nameStyle = css`
  margin: 0;
  overflow: hidden;

  ${typography.bodyStrong};
  color: ${color.text.primary};
  letter-spacing: -0.4px;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const metadataStyle = css`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;

  margin: 5px 0 0;

  ${typography.bodySmall};
  color: ${color.text.secondary};
  white-space: nowrap;

  strong {
    ${typography.bodySmallStrong};
    color: ${color.text.primary};
  }
`;

const actionsStyle = css`
  position: relative;
  z-index: 2;
  display: flex;
  gap: 8px;
`;

const actionButtonStyle = css`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  cursor: pointer;
  user-select: none;

  &::after {
    position: absolute;
    inset: -4px;
    content: '';
  }

  &:focus-visible {
    outline: 3px solid ${color.focus.ring};
    outline-offset: 2px;
  }
`;

const detailButtonStyle = css`
  color: ${color.icon.default};
  background: transparent;

  svg {
    width: 22px;
    height: 22px;
  }

  &:hover {
    color: ${color.icon.brand};
    background: ${color.background.brandSubtle};
  }

  &:active {
    color: ${color.icon.brand};
    background: ${color.background.brandSubtlePressed};
  }
`;

const directionsButtonStyle = css`
  color: ${color.icon.inverse};
  background: ${color.background.brand};

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    background: ${color.background.brandHovered};
  }

  &:active {
    background: ${color.background.brandPressed};
  }
`;
