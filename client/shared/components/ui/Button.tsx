import { css, cx } from '@emotion/css';
import type { ComponentProps, ReactNode } from 'react';
import { color } from '../../../src/theme/color';
import { palette } from '../../../src/theme/palette';
import { typography } from '../../../src/theme/typography';

/**
 * 버튼의 외형.
 *
 * - brand: 길찾기·다음·신고처럼 브랜드색으로 강조하는 실행 버튼
 * - subtle: 로드뷰처럼 연한 브랜드 배경과 테두리를 사용하는 버튼
 * - outline: 흰 배경과 중립색 테두리를 사용하는 보조 버튼
 * - ghost: 배경 없이 글자나 아이콘을 표시하는 버튼
 * - rose: 분홍색 버튼. aria-pressed가 true이면 배경과 글자색을 반전한다.
 */
type ButtonVariant = 'brand' | 'subtle' | 'outline' | 'ghost' | 'rose';

/** active는 사용 가능, loading은 처리 중, inactive는 비활성 상태 */
type ButtonStatus = 'active' | 'loading' | 'inactive';

/** 내부 여백·모서리·아이콘 영역 크기를 함께 결정한다. */
type ButtonSize = 'sm' | 'md' | 'lg';
type ButtonSizeToken = 'paddingX' | 'paddingY' | 'borderRadius' | 'gap' | 'iconSize';

/**
 * 사이즈별 치수.
 *
 * rem 값은 기본 글꼴 16px 기준으로 주석의 px에 대응한다.
 * height가 아니라 paddingY를 사용해서 높이를 지정한다. (글자가 커져도 버튼에 짤리지 않게 하기 위해)
 */
const BUTTON_SIZE = {
  lg: {
    paddingX: '0.5rem' /* 8px */,
    paddingY: '1rem' /* 16px */,
    borderRadius: '0.875rem' /* 14px */,
    gap: '0.5rem' /* 8px */,
    iconSize: '1.375rem' /* 22px */,
  },
  md: {
    paddingX: '0.25rem' /* 4px */,
    paddingY: '0.75rem' /* 12px */,
    borderRadius: '0.75rem' /* 12px */,
    gap: '0.25rem' /* 4px */,
    iconSize: '1.125rem' /* 18px */,
  },
  sm: {
    paddingX: '0.0125rem' /* 2px */,
    paddingY: '0.5rem' /* 8px */,
    borderRadius: '0.75rem' /* 12px */,
    gap: '0.375rem' /* 6px */,
    iconSize: '1rem' /* 16px */,
  },
} as const satisfies Record<ButtonSize, Record<ButtonSizeToken, string>>;

/**
 * 외형과 상태별 색상.
 *
 * hover와 클릭에는 같은 색상을 사용한다.
 * 로딩·비활성 상태에는 hover와 클릭 색상을 적용하지 않는다.
 */
const buttonAppearance = {
  brand: {
    active: css`
      background-color: ${color.background.brand};
      color: ${color.text.inverse};
      box-shadow: none;

      &:hover:not(:disabled),
      &:active:not(:disabled) {
        background-color: ${color.background.brandHovered};
      }
    `,
    loading: css`
      background-color: ${color.background.brand};
      color: ${color.text.inverse};
      box-shadow: none;
    `,
    inactive: css`
      background-color: ${color.background.disabled};
      color: ${color.text.disabled};
      box-shadow: none;
    `,
  },
  subtle: {
    active: css`
      background-color: ${color.background.brandSubtle};
      color: ${color.text.brand};
      box-shadow: inset 0 0 0 1px ${color.border.brandSubtle};

      &:hover:not(:disabled),
      &:active:not(:disabled) {
        background-color: ${color.background.brandSubtleHovered};
      }
    `,
    loading: css`
      background-color: ${color.background.brandSubtle};
      color: ${color.text.brand};
      box-shadow: inset 0 0 0 1px ${color.border.brandSubtle};
    `,
    inactive: css`
      background-color: ${color.background.disabled};
      color: ${color.text.disabled};
      box-shadow: inset 0 0 0 1px ${color.border.default};
    `,
  },
  outline: {
    active: css`
      background-color: ${color.background.default};
      color: ${color.text.secondary};
      box-shadow: inset 0 0 0 1px ${color.border.default};

      &:hover:not(:disabled),
      &:active:not(:disabled) {
        background-color: ${color.background.subtle};
      }
    `,
    loading: css`
      background-color: ${color.background.default};
      color: ${color.text.secondary};
      box-shadow: inset 0 0 0 1px ${color.border.default};
    `,
    inactive: css`
      background-color: ${color.background.default};
      color: ${color.text.disabled};
      box-shadow: inset 0 0 0 1px ${color.border.default};
    `,
  },
  ghost: {
    active: css`
      background-color: transparent;
      color: ${color.text.secondary};
      box-shadow: none;

      &:hover:not(:disabled),
      &:active:not(:disabled) {
        background-color: ${color.background.subtle};
      }
    `,
    loading: css`
      background-color: transparent;
      color: ${color.text.secondary};
      box-shadow: none;
    `,
    inactive: css`
      background-color: transparent;
      color: ${color.text.disabled};
      box-shadow: none;
    `,
  },
  rose: {
    active: css`
      background-color: ${palette.rose50};
      color: ${palette.rose500};
      box-shadow: inset 0 0 0 1px ${palette.rose200};

      &:hover:not(:disabled),
      &:active:not(:disabled) {
        background-color: ${palette.rose100};
      }

      &[aria-pressed='true'] {
        background-color: ${palette.rose500};
        color: ${color.text.inverse};
        box-shadow: inset 0 0 0 1px ${palette.rose500};

        &:hover:not(:disabled),
        &:active:not(:disabled) {
          background-color: ${palette.rose600};
        }
      }
    `,
    loading: css`
      background-color: ${palette.rose50};
      color: ${palette.rose500};
      box-shadow: inset 0 0 0 1px ${palette.rose200};

      &[aria-pressed='true'] {
        background-color: ${palette.rose500};
        color: ${color.text.inverse};
        box-shadow: inset 0 0 0 1px ${palette.rose500};
      }
    `,
    inactive: css`
      background-color: ${palette.rose50};
      color: ${color.text.disabled};
      box-shadow: inset 0 0 0 1px ${palette.rose200};
    `,
  },
} satisfies Record<ButtonVariant, Record<ButtonStatus, string>>;

interface Props extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  icon?: ReactNode;
  /**
   * 부모의 사용 가능한 너비를 채운다.
   * @default false
   * */
  isFullWidth?: boolean;
}

/** 버튼 본체의 공통 스타일, 크기와 너비, 상태별 커서를 결정한다. */
const root = (size: ButtonSize, status: ButtonStatus, isFullWidth: boolean) => {
  const sizeToken = BUTTON_SIZE[size];

  return css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    ${isFullWidth ? 'width: 100%;' : ''}
    white-space: nowrap;
    gap: ${sizeToken.gap};
    padding: ${sizeToken.paddingY} ${sizeToken.paddingX};
    border: 0;
    border-radius: ${sizeToken.borderRadius};
    font-family: inherit;
    ${typography.label};
    cursor: ${status === 'active' ? 'pointer' : 'default'};

    &:focus-visible {
      outline: 0.1875rem solid ${color.focus.ring};
      outline-offset: 0.0625rem;
    }
  `;
};

/** 아이콘을 감싸는 영역의 크기. SVG·이미지 자체의 크기는 전달한 요소에서 지정한다. */
const iconStyle = (size: ButtonSize) => {
  const sizeToken = BUTTON_SIZE[size];

  return css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: ${sizeToken.iconSize};
    height: ${sizeToken.iconSize};
  `;
};

/**
 * 실행 버튼. 기본 type은 button이다.
 * 위치와 바깥 여백, 최대 너비는 사용처의 className이나 style로 지정한다.
 */
export const Button = ({
  type = 'button',
  variant = 'brand',
  size = 'md',
  isLoading = false,
  disabled = false,
  isFullWidth = false,
  icon,
  className,
  children,
  ...props
}: Props) => {
  const status: ButtonStatus = isLoading ? 'loading' : disabled ? 'inactive' : 'active';
  const appearance = buttonAppearance[variant][status];

  return (
    <button
      {...props}
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      className={cx(root(size, status, isFullWidth), appearance, className)}
    >
      {!isLoading && icon && (
        <span aria-hidden="true" className={iconStyle(size)}>
          {icon}
        </span>
      )}
      {isLoading ? '처리 중…' : children}
    </button>
  );
};
