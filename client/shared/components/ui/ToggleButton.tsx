import { css, cx } from '@emotion/css';
import type { ComponentProps } from 'react';
import { color } from '../../../src/theme/color';
import { Button } from './Button';

/** 토글 버튼의 외형. (현재는 outline만 제공) */
type ToggleButtonVariant = 'outline';

/** 토글 버튼의 Props. 기존 버튼의 onClick만 방지하고 나머지 요소는 가져온다. */
interface Props extends Omit<ComponentProps<typeof Button>, 'onClick'> {
  /** 버튼 외형. 생략하면 outline을 사용한다. */
  variant?: ToggleButtonVariant;
  /** 부모가 관리하는 현재 선택 상태. */
  pressed: boolean;
  /** 클릭하면 다음 선택값을 전달한다. 상태 변경과 API 요청은 사용처가 담당한다. */
  onPressedChange: (pressed: boolean) => void;
}

/**
 * 선택과 해제가 가능한 outline 버튼.
 * 크기·아이콘·포커스는 Button을 재사용하고, pressed로 선택 스타일을 결정한다.
 * 내부 상태를 만들지 않으며, 도메인별 선택색은 className으로 지정한다.
 */
export const ToggleButton = ({
  variant = 'outline',
  pressed,
  onPressedChange,
  disabled = false,
  isLoading = false,
  className,
  ...props
}: Props) => {
  const appearance = toggleButtonAppearance[variant];

  return (
    <Button
      {...props}
      variant={variant}
      disabled={disabled}
      isLoading={isLoading}
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cx(pressed && (isLoading || !disabled) && appearance, className)}
    />
  );
};

const toggleButtonAppearance = {
  outline: css`
    background-color: ${color.background.selectedSubtle};
    color: ${color.text.selected};
    box-shadow: inset 0 0 0 1px ${color.border.selected};

    &:hover:not(:disabled),
    &:active:not(:disabled) {
      background-color: ${color.background.brandSubtleHovered};
    }
  `,
} satisfies Record<ToggleButtonVariant, string>;
