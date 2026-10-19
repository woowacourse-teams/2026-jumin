import { css, cx } from '@emotion/css';
import type { ComponentProps, ReactNode } from 'react';
import { color } from '../../../src/theme/color';
import { fontSize } from '../../../src/theme/font';
import { palette } from '../../../src/theme/palette';
import { typography } from '../../../src/theme/typography';

interface Props extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  icon?: ReactNode;
}

/**
 * 버튼의 외형.
 *
 * - brand: 길찾기·다음·신고처럼 브랜드색으로 강조하는 실행 버튼
 * - subtle: 로드뷰처럼 연한 브랜드 배경과 테두리를 사용하는 버튼
 * - outline: 흰 배경과 중립색 테두리를 사용하는 보조 버튼
 * - ghost: 배경 없이 글자나 아이콘을 표시하는 버튼
 * - rose: 좋아요처럼 분홍색을 사용하는 버튼. 선택 여부는 aria-pressed로 전달합니다.
 */
type ButtonVariant = 'brand' | 'subtle' | 'outline' | 'ghost' | 'rose';

/** active는 사용 가능, loading은 처리 중, inactive는 비활성 상태입니다. */
type ButtonStatus = 'active' | 'loading' | 'inactive';

/** 최소 높이·내부 여백·모서리·아이콘 크기를 함께 결정합니다. */
type ButtonSize = 'sm' | 'md' | 'lg';
type ButtonSizeToken =
  'minHeight' | 'paddingX' | 'paddingY' | 'borderRadius' | 'gap' | 'iconSize' | 'spinnerSize';

/**
 * 사이즈별 치수. rem 값은 기본 글꼴 16px 기준으로 주석의 px에 대응합니다.
 *
 * sm은 추천 카드의 버튼, md는 상세 액션, lg는 가이드·재시도 버튼을 기준으로 합니다.
 * md의 좌우 여백은 상세 페이지의 3열 배치에 맞춰 작게 유지합니다.
 * height 대신 min-height를 사용해 내용에 따라 높이가 늘어나도록 합니다.
 * 사용자가 글꼴 크기를 키워도 버튼이 함께 커져서 글자가 잘리지 않아요.
 */
const BUTTON_SIZE = {
  lg: {
    minHeight: '3.25rem' /* 52px */,
    paddingX: '1.25rem' /* 20px */,
    paddingY: '0rem',
    borderRadius: '0.875rem' /* 14px */,
    gap: '0.5rem' /* 8px */,
    iconSize: '1.375rem' /* 22px */,
    spinnerSize: '1.375rem' /* 22px */,
  },
  md: {
    minHeight: '3rem' /* 48px */,
    paddingX: '0.25rem' /* 4px */,
    paddingY: '0rem',
    borderRadius: '0.75rem' /* 12px */,
    gap: '0.25rem' /* 4px */,
    iconSize: '1.125rem' /* 18px */,
    spinnerSize: '1.125rem' /* 18px */,
  },
  sm: {
    minHeight: '2.75rem' /* 44px */,
    paddingX: '0.625rem' /* 10px */,
    paddingY: '0rem',
    borderRadius: '0.75rem' /* 12px */,
    gap: '0.375rem' /* 6px */,
    iconSize: '1rem' /* 16px */,
    spinnerSize: '1rem' /* 16px */,
  },
} as const satisfies Record<ButtonSize, Record<ButtonSizeToken, string>>;

/**
 * 외형과 상태별 색상. 로딩 중에는 기본 색상을 유지합니다.
 * 테두리는 inset 그림자로 표시해 상태가 바뀌어도 버튼 크기가 달라지지 않습니다.
 */
const buttonAppearance = {
  brand: {
    active: css`
      background-color: ${color.background.brand};
      color: ${color.text.inverse};
      box-shadow: none;
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
    `,
    loading: css`
      background-color: ${palette.rose50};
      color: ${palette.rose500};
      box-shadow: inset 0 0 0 1px ${palette.rose200};
    `,
    inactive: css`
      background-color: ${palette.rose50};
      color: ${color.text.disabled};
      box-shadow: inset 0 0 0 1px ${palette.rose200};
    `,
  },
} satisfies Record<ButtonVariant, Record<ButtonStatus, string>>;

/** 버튼 본체의 공통 스타일, 크기와 상태별 커서를 결정합니다. */
const root = (size: ButtonSize, status: ButtonStatus) => {
  const sizeToken = BUTTON_SIZE[size];

  return css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: ${sizeToken.minHeight};
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
      outline-offset: 0.125rem;
    }

    @media (max-width: 22.5rem) {
      font-size: ${fontSize[12]};
      padding-inline: ${size === 'md' ? '0.125rem' : sizeToken.paddingX};
    }
  `;
};

/** 아이콘 영역의 크기를 고정하고 SVG와 이미지가 영역 안에 맞도록 합니다. */
const iconStyle = (size: ButtonSize) => {
  const sizeToken = BUTTON_SIZE[size];

  return css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: ${sizeToken.iconSize};
    height: ${sizeToken.iconSize};

    @media (max-width: 22.5rem) {
      width: ${size === 'md' ? '1rem' : sizeToken.iconSize};
      height: ${size === 'md' ? '1rem' : sizeToken.iconSize};
    }

    > svg,
    > img {
      display: block;
      width: 100%;
      height: 100%;
    }
  `;
};

export const Button = ({
  variant = 'brand',
  size = 'md',
  isLoading = false,
  disabled = false,
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
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      className={cx(root(size, status), appearance, className)}
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
