import { css, cx } from '@emotion/css';
import type { ReactNode } from 'react';
import { color } from '../../../../src/theme/color';
import { fontSize } from '../../../../src/theme/font';
import { typography } from '../../../../src/theme/typography';

interface Props {
  onDirections: () => void;
  onRoadView: () => void;
  children?: ReactNode;
}

export const ParkingDetailActions = ({ onDirections, onRoadView, children }: Props) => (
  <section
    className={cx(actionsStyle, children ? threeActionsStyle : undefined)}
    aria-label="주차장 빠른 메뉴"
  >
    <button
      className={cx(buttonStyle, directionsStyle)}
      type="button"
      aria-label="길찾기 시작"
      onClick={onDirections}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m3 10 18-7-7 18-4-7-7-4Z" />
      </svg>
      길찾기
    </button>
    <button
      className={cx(buttonStyle, roadViewStyle)}
      type="button"
      aria-label="로드뷰 보기"
      onClick={onRoadView}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 6h4l2-2h4l2 2h4v14H4Z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
      로드뷰
    </button>
    {children}
  </section>
);

const actionsStyle = css`
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  flex-shrink: 0;
  align-items: start;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid ${color.border.default};
`;

const threeActionsStyle = css`
  grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr));
`;

const buttonStyle = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  min-height: 48px;
  padding: 0 4px;
  font-family: inherit;
  ${typography.label};
  white-space: nowrap;
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;

  svg {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  &:focus-visible {
    outline: 3px solid ${color.focus.ring};
    outline-offset: 2px;
  }

  @media (max-width: 360px) {
    padding-inline: 2px;
    font-size: ${fontSize[12]};

    svg {
      width: 16px;
      height: 16px;
    }
  }
`;

const directionsStyle = css`
  color: ${color.text.inverse};
  background: ${color.background.brand};

  &:hover {
    background: ${color.background.brandHovered};
  }

  &:active {
    background: ${color.background.brandPressed};
  }
`;

const roadViewStyle = css`
  color: ${color.text.brand};
  background: ${color.background.brandSubtle};
  border-color: ${color.border.brandSubtle};

  &:hover {
    background: ${color.background.brandSubtleHovered};
  }

  &:active {
    background: ${color.background.brandSubtlePressed};
  }
`;
