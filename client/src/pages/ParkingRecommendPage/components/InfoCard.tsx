import { Row } from '../../../shared/components/ui/Row';
import { css, keyframes } from '@emotion/css';
import type { CSSProperties } from 'react';

import type { ParkingLotSummary } from '../../../api/contracts';
import { trackEvent } from '../../../shared/analytics';
import { Button } from '../../../shared/components/ui/Button';
import { eventName } from '../../../shared/monitoring/constants';
import { color } from '../../../theme/color';
import { duration, easing } from '../../../theme/motion';
import { radius } from '../../../theme/radius';
import { typography } from '../../../theme/typography';
import { DirectionsIcon, InformationIcon } from '../../../shared/components/ui/icons';

interface Props {
  parkingLot: ParkingLotSummary;
  description: string;
  rank: number;
  /** 거리 막대의 전체 길이가 나타내는 검색 반경(m). */
  searchRadiusMeters: number;
  onSelect: (parkingLot: ParkingLotSummary) => void;
  onNavigate: (parkingLot: ParkingLotSummary) => void;
  onDirections: (parkingLot: ParkingLotSummary) => void;
  isActive: boolean;
}

export const InfoCard = ({
  parkingLot,
  description,
  rank,
  searchRadiusMeters,
  onSelect,
  onNavigate,
  onDirections,
  isActive,
}: Props) => {
  const { name, estimatedFee, distanceMeters, walkingDurationMinutes } = parkingLot;
  const hasWalkingInformation = walkingDurationMinutes !== null && distanceMeters !== null;
  // 막대는 검색 반경을 넘지 않는다. 반경이 0이면 길이를 계산하지 않는다.
  const distanceRatio =
    hasWalkingInformation && searchRadiusMeters > 0
      ? Math.min(distanceMeters / searchRadiusMeters, 1)
      : 0;

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
      <span className={rankNumberStyle(isActive)} aria-hidden="true">
        {rank}
      </span>
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
      <p className={descriptionStyle}>
        <span className={visuallyHiddenStyle}>추천 {rank}위 </span>
        {description}
      </p>

      {hasWalkingInformation ? (
        <p className={walkingStyle}>
          <span
            className={trackStyle(isActive)}
            style={{ '--distance-ratio': distanceRatio } as CSSProperties}
            aria-hidden="true"
          >
            <span className="bar" />
            <span className="parking">P</span>
            <span className="destination" />
          </span>
          <strong>도보 {walkingDurationMinutes}분</strong>
          <span>{distanceMeters.toLocaleString('ko-KR')}m</span>
        </p>
      ) : (
        <p className={walkingStyle}>
          <span>도보 정보 없음</span>
        </p>
      )}

      <strong className={priceStyle}>
        {estimatedFee === null ? '요금 정보 없음' : `${estimatedFee.toLocaleString('ko-KR')}원`}
      </strong>

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

/** 처음 나타날 때 거리 막대가 주차장에서 목적지 쪽으로 그려진다. */
const barDraw = keyframes`
  from { transform: scaleX(0); }
`;

const cardStyle = (isActive: boolean) => css`
  position: relative;
  display: grid;
  grid-template-areas:
    'rank header header'
    'rank description description'
    '. walking walking'
    '. price button';
  grid-template-columns: 24px minmax(0, 1fr) auto;
  column-gap: 8px;
  align-items: center;

  width: 100%;
  padding: 12px 12px 14px 10px;

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

const rankNumberStyle = (isActive: boolean) => css`
  grid-area: rank;
  align-self: start;
  pointer-events: none;

  ${typography.titleSection};
  color: ${isActive ? color.text.selected : color.text.secondary};
  font-variant-numeric: tabular-nums;
  text-align: center;
  transition: color ${duration.base} ${easing.out};
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

const descriptionStyle = css`
  grid-area: description;
  pointer-events: none;

  margin: 0;

  ${typography.bodySmall};
  color: ${color.text.secondary};
`;

const visuallyHiddenStyle = css`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`;

const walkingStyle = css`
  grid-area: walking;
  pointer-events: none;

  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0 0;

  ${typography.bodySmall};
  color: ${color.text.secondary};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;

  strong {
    ${typography.bodySmallStrong};
    color: ${color.text.primary};
  }
`;

/**
 * 도보 거리 막대.
 * 전체 길이는 검색 반경, 채운 길이는 주차장(P)에서 목적지(빨간 고리)까지의 거리다.
 */
const trackStyle = (isActive: boolean) => {
  const barColor = isActive ? color.walkingDistance.barSelected : color.walkingDistance.bar;

  return css`
    --track-start: 8px;
    --track-length: calc(100% - 14px);

    position: relative;
    flex: 1;
    min-width: 48px;
    height: 18px;

    &::before {
      content: '';
      position: absolute;
      top: 8px;
      right: 0;
      left: var(--track-start);
      height: 2px;
      background: ${color.walkingDistance.track};
      border-radius: 2px;
    }

    .bar {
      position: absolute;
      top: 8px;
      left: var(--track-start);
      width: calc(var(--distance-ratio) * var(--track-length));
      height: 2px;
      background: ${barColor};
      border-radius: 2px;
      transform-origin: left;
      transition: background-color ${duration.base} ${easing.out};
      animation: ${barDraw} ${duration.slow} ${easing.inOut} backwards;
    }

    .parking {
      position: absolute;
      top: 1px;
      left: 0;
      width: 16px;
      height: 16px;
      color: ${color.text.inverse};
      font-size: 9px;
      font-weight: 800;
      line-height: 16px;
      text-align: center;
      background: ${barColor};
      border-radius: 50%;
      transition: background-color ${duration.base} ${easing.out};
    }

    .destination {
      position: absolute;
      top: 3px;
      left: calc(var(--track-start) + var(--distance-ratio) * var(--track-length) - 6px);
      width: 12px;
      height: 12px;
      background: ${color.background.default};
      border-radius: 50%;
      box-shadow: inset 0 0 0 3px ${color.walkingDistance.destination};
    }
  `;
};

const priceStyle = css`
  grid-area: price;
  pointer-events: none;

  margin-top: 8px;
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

  margin: 8px 0 0 8px;

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
