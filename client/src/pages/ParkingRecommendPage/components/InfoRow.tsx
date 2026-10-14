import { css, cx } from '@emotion/css';

import type { ParkingLotSummary } from '../../../../api/contracts';
import { DirectionsIcon, InformationIcon } from './ParkingActionIcons';

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
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
      </span>

      <div className={informationStyle}>
        <h2 className={nameStyle}>{name}</h2>

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
          <InformationIcon />
        </button>
        <button
          className={cx(actionButtonStyle, directionsButtonStyle)}
          type="button"
          aria-label={`${name} 길찾기`}
          onClick={() => onDirections(parkingLot)}
        >
          <DirectionsIcon />
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

  background: ${isActive ? '#f1f3ff' : '#ffffff'};
  border: 2px solid ${isActive ? '#4356d8' : 'transparent'};
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
    outline: 3px solid rgb(67 86 216 / 30%);
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
  color: #1677ff;
  background: #edf5ff;
  border-radius: 14px;
  pointer-events: none;

  svg {
    width: 28px;
    height: 28px;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
`;

const nameStyle = css`
  margin: 0;
  overflow: hidden;

  color: #101b37;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.35;
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

  color: #697386;
  font-size: 13px;
  line-height: 1.3;
  white-space: nowrap;

  strong {
    color: #101b37;
    font-size: 13px;
    font-weight: 800;
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
    outline: 3px solid rgb(67 86 216 / 30%);
    outline-offset: 2px;
  }
`;

const detailButtonStyle = css`
  color: #697386;
  background: transparent;

  svg {
    width: 22px;
    height: 22px;
  }

  &:hover {
    color: #4356d8;
    background: #f1f3ff;
  }
`;

const directionsButtonStyle = css`
  color: #ffffff;
  background: #4356d8;

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    background: #3548c8;
  }
`;
