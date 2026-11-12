import { Row } from '../../../shared/components/ui/Row';
import { css } from '@emotion/css';

import type { ParkingLotSummary } from '../../../api/contracts';
import { trackEvent } from '../../../shared/analytics';
import { Button } from '../../../shared/components/ui/Button';
import { eventName } from '../../../shared/monitoring/constants';
import { color } from '../../../theme/color';
import { duration, easing } from '../../../theme/motion';
import { radius } from '../../../theme/radius';
import { typography } from '../../../theme/typography';
import { DirectionsIcon, InformationIcon, WalkingIcon } from '../../../shared/components/ui/icons';

interface Props {
  parkingLot: ParkingLotSummary;
  /** 화면에는 표시하지 않고 스크린리더에 "추천 N위"로 읽힌다. */
  rank: number;
  onSelect: (parkingLot: ParkingLotSummary) => void;
  onNavigate: (parkingLot: ParkingLotSummary) => void;
  onDirections: (parkingLot: ParkingLotSummary) => void;
  isActive: boolean;
}

export const InfoCard = ({
  parkingLot,
  rank,
  onSelect,
  onNavigate,
  onDirections,
  isActive,
}: Props) => {
  const { name, estimatedFee, distanceMeters, walkingDurationMinutes } = parkingLot;
  const walkingInformation =
    walkingDurationMinutes === null || distanceMeters === null
      ? '정보 없음'
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
      <span className={visuallyHiddenStyle}>추천 {rank}위</span>
      <Row as="header" align="center" justify="between" gap={8} className={headerStyle}>
        <h3 className={nameStyle}>{name}</h3>
        <button
          className={detailButtonStyle}
          type="button"
          aria-label={`${name} 상세정보`}
          onClick={handleDetailButtonClick}
        >
          <InformationIcon size={24} aria-hidden="true" />
        </button>
      </Row>
      <strong className={priceStyle}>
        {estimatedFee === null ? '요금 정보 없음' : `${estimatedFee.toLocaleString('ko-KR')}원`}
      </strong>

      <p className={walkingStyle}>
        <WalkingIcon className={walkingIconStyle} aria-hidden="true" />
        <span className={visuallyHiddenStyle}>도보 </span>
        {walkingInformation}
      </p>

      <Button
        // 선택한 카드의 길찾기만 채워서, 세 버튼이 동시에 눈을 끌지 않게 한다.
        variant={isActive ? 'brand' : 'subtle'}
        className={navigateButtonStyle}
        aria-label={`${name} 길찾기`}
        icon={<DirectionsIcon size={18} />}
        onClick={() => onDirections(parkingLot)}
      >
        길찾기
      </Button>
    </article>
  );
};

const cardStyle = (isActive: boolean) => css`
  position: relative;
  display: grid;
  grid-template-areas:
    'header header'
    'price button'
    'walking button';
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 8px;
  align-items: center;

  width: 100%;
  padding: 14px 12px 14px 16px;

  /* 선택은 테두리 두께가 아니라 면으로 표시한다. */
  background: ${isActive ? color.background.selectedSubtle : 'transparent'};
  border-radius: ${radius.md};
  user-select: none;
  -webkit-user-drag: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  transition: background-color ${duration.base} ${easing.out};

  ${
    isActive
      ? ''
      : `
  &:has(> button[aria-pressed]:active) {
    background: ${color.background.pressed};
  }`
  }

  /* 선택 버튼의 안쪽 경계 대신 카드의 실제 테두리를 따라 포커스를 표시한다. */
  &:has(> button[aria-pressed]:focus-visible) {
    outline: var(--focus-ring-width) solid var(--focus-ring-color);
    outline-offset: var(--focus-ring-offset);
  }

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

const visuallyHiddenStyle = css`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`;

/** 가격 아래 줄에 보행자 아이콘과 함께 도보 거리·시간을 표시한다. */
const walkingStyle = css`
  grid-area: walking;
  pointer-events: none;

  display: flex;
  align-items: center;
  gap: 4px;
  margin: 2px 0 0;

  ${typography.bodySmall};
  color: ${color.text.secondary};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

const walkingIconStyle = css`
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  color: ${color.icon.default};
`;

const priceStyle = css`
  grid-area: price;
  pointer-events: none;

  margin-top: 10px;
  overflow: hidden;

  ${typography.titleSection};
  color: ${color.text.primary};
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const navigateButtonStyle = css`
  position: relative;
  grid-area: button;
  align-self: center;

  margin: 10px 0 0 8px;

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
  margin: -8px -8px -8px 0;
  padding: 0;
  color: ${color.icon.default};
  background: transparent;
  border: 0;
  border-radius: ${radius.sm};
  cursor: pointer;
  transition:
    background-color ${duration.fast} ${easing.out},
    color ${duration.fast} ${easing.out};

  @media (hover: hover) {
    &:hover {
      color: ${color.icon.brand};
      background: ${color.background.brandSubtleHovered};
    }
  }

  &:active {
    color: ${color.icon.brand};
    background: ${color.background.brandSubtlePressed};
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
    outline: none;
  }
`;
