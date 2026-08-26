import { css } from '@emotion/css';

import type { ParkingLotSummary } from '../../../../api/contracts';

interface Props {
  parkingLot: ParkingLotSummary;
  description: string;
  onNavigate: (parkingLot: ParkingLotSummary) => void;
  isActive: boolean;
}

export const InfoCard = ({ parkingLot, description, onNavigate, isActive }: Props) => {
  const { name, estimatedFee, distanceMeters } = parkingLot;

  return (
    <article className={cardStyle(isActive)} draggable={false}>
      <h2 className={nameStyle}>{name}</h2>

      <p className={descriptionStyle}>{description}</p>

      <strong className={priceStyle}>
        {estimatedFee === null ? '요금 정보 없음' : `${estimatedFee.toLocaleString('ko-KR')}원`}
      </strong>

      <p className={distanceStyle}>{distanceMeters.toLocaleString('ko-KR')}m</p>

      <button className={navigateButtonStyle} type="button" onClick={() => onNavigate(parkingLot)}>
        상세정보
      </button>
    </article>
  );
};

const cardStyle = (isActive: boolean) => css`
  display: grid;
  grid-template-areas:
    'name name'
    'description description'
    'price button'
    'distance button';
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;

  width: 100%;
  min-height: 158px;
  padding: 16px 18px;

  background: #ffffff;
  border: ${isActive ? '4px' : ' 2px'} solid #4356d8;

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

const nameStyle = css`
  grid-area: name;

  margin: 0;
  overflow: hidden;

  color: #101b37;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.3;
  letter-spacing: -0.4px;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const descriptionStyle = css`
  grid-area: description;

  margin: 4px 0 12px;

  color: #4356d8;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
`;

const priceStyle = css`
  grid-area: price;

  overflow: hidden;

  color: #101b37;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const distanceStyle = css`
  grid-area: distance;

  margin: 2px 0 0;

  color: #697386;
  font-size: 14px;
  line-height: 1.4;
`;

const navigateButtonStyle = css`
  grid-area: button;

  min-width: 90px;
  height: 56px;
  margin-left: 14px;
  padding: 0 16px;

  color: #ffffff;
  font-size: 16px;
  font-weight: 700;

  background: #4356d8;
  border: 0;
  border-radius: 16px;
  cursor: pointer;

  &:hover {
    background: #3548c8;
  }

  &:focus-visible {
    outline: 2px solid #4356d8;
    outline-offset: 2px;
  }

  user-select: none;
  -webkit-user-drag: none;
`;
