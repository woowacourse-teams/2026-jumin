import { css } from '@emotion/css';

import type { ParkingLotSummary } from '../../../../api/contracts';

interface Props {
  parkingLot: ParkingLotSummary;
  isActive?: boolean;
  onSelect: (parkingLot: ParkingLotSummary) => void;
  onNavigate: (parkingLot: ParkingLotSummary) => void;
}

export const InfoRow = ({ parkingLot, isActive = false, onSelect, onNavigate }: Props) => {
  const { name, estimatedFee, distanceMeters } = parkingLot;

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
        <LocationIcon />
      </span>

      <div className={informationStyle}>
        <h2 className={nameStyle}>{name}</h2>

        <p className={metadataStyle}>
          <strong>
            {estimatedFee === null ? '요금 정보 없음' : `${estimatedFee.toLocaleString('ko-KR')}원`}
          </strong>
          <span>{distanceMeters.toLocaleString('ko-KR')}m</span>
        </p>
      </div>

      <button
        className={detailButtonStyle(isActive)}
        type="button"
        onClick={() => onNavigate(parkingLot)}
      >
        상세보기
      </button>
    </article>
  );
};

const LocationIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
);

const rowStyle = (isActive: boolean) => css`
  position: relative;

  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;

  width: 100%;
  min-height: 92px;
  padding: 0px 10px;

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

const informationStyle = css`
  position: relative;
  z-index: 1;

  min-width: 0;
  pointer-events: none;
`;

const nameStyle = css`
  margin: 0;
  overflow: hidden;

  color: #101b37;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.35;
  letter-spacing: -0.4px;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const metadataStyle = css`
  display: flex;
  align-items: baseline;
  gap: 10px;

  margin: 2px 0 0;

  color: #697386;
  font-size: 16px;
  line-height: 1.3;
  white-space: nowrap;

  strong {
    color: #101b37;
    font-size: 16px;
    font-weight: 800;
  }
`;

const detailButtonStyle = (isActive: boolean) => css`
  position: relative;
  z-index: 2;

  min-width: 94px;
  height: 56px;
  padding: 0 14px;

  color: ${isActive ? '#1256c4' : '#ffffff'};
  font-size: 16px;
  font-weight: 700;

  background: ${isActive ? '#ffffff' : '#4356d8'};
  border: 1px solid ${isActive ? '#d9deeb' : 'transparent'};
  border-radius: 16px;
  box-shadow: ${isActive ? '0 2px 8px rgb(16 27 55 / 8%)' : 'none'};
  cursor: pointer;
  user-select: none;

  &:hover {
    background: ${isActive ? '#f8f9fc' : '#3548c8'};
  }

  &:focus-visible {
    outline: 3px solid rgb(67 86 216 / 30%);
    outline-offset: 2px;
  }
`;
