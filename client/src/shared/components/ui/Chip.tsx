import { css, cx } from '@emotion/css';
import type { ReactNode } from 'react';
import { color } from '../../../theme/color';
import { typography } from '../../../theme/typography';

const CHIP = {
  minHeight: '38px',
  paddingX: '16px',
  gap: '8px',
  radius: '26px',
  iconSize: '22px',
} as const;

interface Props {
  children: string;
  icon?: ReactNode;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  /** 화면에서의 배치 스타일. */
  className?: string;
}

/** 선택 조건을 켜거나 끈다. 선택 상태와 아이콘의 의미·색상은 사용처가 관리한다. */
export const Chip = ({ children, icon, selected, onSelectedChange, className }: Props) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={() => onSelectedChange(!selected)}
    className={cx(appearance(selected), className)}
  >
    {icon && (
      <span className={iconStyle} aria-hidden="true">
        {icon}
      </span>
    )}
    {children}
  </button>
);

const appearance = (isSelected: boolean) => css`
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: ${CHIP.gap};

  min-height: ${CHIP.minHeight};
  padding: 0 ${CHIP.paddingX};

  ${typography.label};
  color: ${isSelected ? color.text.selected : color.text.primary};
  white-space: nowrap;

  background: ${isSelected ? color.background.selectedSubtle : color.background.default};
  border: 1px solid ${isSelected ? color.border.selected : color.border.default};
  border-radius: ${CHIP.radius};

  box-shadow: ${
    isSelected ? '0 4px 10px rgba(16, 27, 55, 0.2)' : '0 2px 8px rgba(16, 27, 55, 0.12)'
  };

  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;

  &:hover,
  &:active {
    background: ${isSelected ? color.background.brandSubtleHovered : color.background.subtle};
  }

  &:focus-visible {
    outline: 3px solid ${color.focus.ring};
    outline-offset: 2px;
  }
`;

const iconStyle = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: ${CHIP.iconSize};
  height: ${CHIP.iconSize};
  > svg,
  > img {
    width: 100%;
    height: 100%;
  }
`;
