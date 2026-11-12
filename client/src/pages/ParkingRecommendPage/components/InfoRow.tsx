import { Row } from '../../../shared/components/ui/Row';
import { css, cx } from '@emotion/css';

import type { ParkingLotSummary } from '../../../api/contracts';
import { color } from '../../../theme/color';
import { duration, easing, pressScale } from '../../../theme/motion';
import { radius } from '../../../theme/radius';
import { typography } from '../../../theme/typography';
import { DirectionsIcon, InformationIcon, LocationIcon } from '../../../shared/components/ui/icons';

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
      : `도보 ${walkingDurationMinutes}분 ${distanceMeters.toLocaleString('ko-KR')}m`;

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

        <Row as="p" align="baseline" gap="4px 10px" className={metadataStyle}>
          <strong>
            {estimatedFee === null ? '요금 정보 없음' : `${estimatedFee.toLocaleString('ko-KR')}원`}
          </strong>
          <span>{walkingInformation}</span>
        </Row>
      </div>

      <Row gap={8} className={actionsStyle}>
        <button
          className={cx(actionButtonStyle, detailButtonStyle)}
          type="button"
          aria-label={`${name} 상세정보`}
          onClick={() => onNavigate(parkingLot)}
        >
          <InformationIcon size={22} aria-hidden="true" />
        </button>
        <button
          className={cx(actionButtonStyle, directionsButtonStyle(isActive))}
          type="button"
          aria-label={`${name} 길찾기`}
          onClick={() => onDirections(parkingLot)}
        >
          <DirectionsIcon size={18} aria-hidden="true" />
        </button>
      </Row>
    </article>
  );
};

const rowStyle = (isActive: boolean) => css`
  position: relative;

  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;

  width: 100%;
  min-height: 72px;
  padding: 10px 12px 10px 10px;

  /* 추천 카드와 같이 선택은 면으로 표시한다. */
  background: ${isActive ? color.background.selectedSubtle : 'transparent'};
  border: 0;
  border-radius: ${radius.md};
  transition: background-color ${duration.base} ${easing.out};
  user-select: none;

  ${
    isActive
      ? ''
      : `
  &:has(> button[aria-pressed]:active) {
    background: ${color.background.pressed};
  }`
  }

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
  border-radius: inherit;
  appearance: none;
  cursor: pointer;
  user-select: none;
  -webkit-user-drag: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
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
  width: 44px;
  height: 44px;
  color: ${color.icon.brand};
  background: ${color.background.brandSubtle};
  border-radius: ${radius.sm};
  pointer-events: none;

  svg {
    width: 24px;
    height: 24px;
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
  flex-wrap: wrap;

  margin: 2px 0 0;

  ${typography.bodySmall};
  color: ${color.text.secondary};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;

  strong {
    ${typography.bodySmallStrong};
    color: ${color.text.primary};
  }
`;

const actionsStyle = css`
  position: relative;
  z-index: 2;
`;

const actionButtonStyle = css`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: ${radius.pill};
  cursor: pointer;
  user-select: none;
  transition:
    background-color ${duration.fast} ${easing.out},
    color ${duration.fast} ${easing.out},
    transform ${duration.fast} ${easing.out};

  &:active {
    transform: scale(${pressScale});
  }
`;

const detailButtonStyle = css`
  color: ${color.icon.default};
  background: transparent;

  svg {
    width: 22px;
    height: 22px;
  }

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

/* 선택한 행만 채운 버튼으로 표시한다. 선택하지 않은 행도 한 번에 길찾기를 누를 수 있다. */
const directionsButtonStyle = (isActive: boolean) => css`
  color: ${isActive ? color.icon.inverse : color.icon.brand};
  background: ${isActive ? color.background.brand : color.background.brandSubtle};

  svg {
    width: 18px;
    height: 18px;
  }

  @media (hover: hover) {
    &:hover {
      background: ${isActive ? color.background.brandHovered : color.background.brandSubtleHovered};
    }
  }

  &:active {
    background: ${isActive ? color.background.brandPressed : color.background.brandSubtlePressed};
  }
`;
