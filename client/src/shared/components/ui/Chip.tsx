import { css, cx } from '@emotion/css';
import type { ReactNode } from 'react';
import { color } from '../../../theme/color';
import { duration, easing, pressScale } from '../../../theme/motion';
import { radius } from '../../../theme/radius';
import { shadow } from '../../../theme/shadow';
import { typography } from '../../../theme/typography';

const CHIP = {
  /** 터치 영역 44px을 그대로 높이로 쓴다. */
  minHeight: '44px',
  paddingX: '16px',
  gap: '6px',
  iconSize: '20px',
} as const;

interface Props {
  children: string;
  icon?: ReactNode;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  /** 화면에서의 배치 스타일. */
  className?: string;
}

/**
 * 선택 조건을 켜거나 끈다. 선택 상태와 아이콘의 의미·색상은 사용처가 관리한다.
 * 선택하면 브랜드색 면에 흰 글자로 바뀌므로, 아이콘도 선택 상태에서는 color.icon.inverse를 쓴다.
 */
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
  color: ${isSelected ? color.text.inverse : color.text.primary};
  white-space: nowrap;

  background: ${isSelected ? color.background.selected : color.background.default};
  border: 0;
  border-radius: ${radius.pill};
  box-shadow: ${shadow.floating};

  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color ${duration.fast} ${easing.out},
    color ${duration.fast} ${easing.out},
    transform ${duration.fast} ${easing.out};

  @media (hover: hover) {
    &:hover {
      background: ${isSelected ? color.background.brandHovered : color.background.subtle};
    }
  }

  &:active {
    background: ${isSelected ? color.background.brandPressed : color.background.pressed};
    transform: scale(${pressScale});
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
