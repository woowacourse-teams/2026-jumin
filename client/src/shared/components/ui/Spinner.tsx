import { css, cx, keyframes } from '@emotion/css';

import { color } from '../../../theme/color';

const SPINNER = {
  size: { sm: '1.25rem', lg: '2rem' },
  duration: '800ms', // 한 바퀴 회전하는 시간
  trackOpacity: 0.18, // 뒤쪽 원형 테두리의 불투명도
} as const;

type SpinnerSize = keyof typeof SPINNER.size;
type SpinnerVariant = 'brand' | 'inverse';

interface Props {
  size?: SpinnerSize;
  variant?: SpinnerVariant;
  className?: string;
}

/** 시각적 표시만 담당한다. 대기 안내와 배치는 사용처에서 제공한다. */
export const Spinner = ({ size = 'lg', variant = 'brand', className }: Props) => (
  <svg
    viewBox="0 0 32 32"
    fill="none"
    aria-hidden="true"
    focusable="false"
    className={cx(spinnerStyle(size, variant), className)}
  >
    <circle
      cx="16"
      cy="16"
      r="14"
      stroke="currentColor"
      strokeWidth="4"
      opacity={SPINNER.trackOpacity}
    />
    <circle
      cx="16"
      cy="16"
      r="14"
      stroke="currentColor"
      strokeWidth="4"
      pathLength="100"
      strokeDasharray="75 25"
    />
  </svg>
);

const rotate = keyframes`
  to { transform: rotate(360deg); }
`;

const spinnerStyle = (size: SpinnerSize, variant: SpinnerVariant) => css`
  display: block;
  flex-shrink: 0;
  width: ${SPINNER.size[size]};
  height: ${SPINNER.size[size]};
  color: ${color.icon[variant]};
  animation: ${rotate} ${SPINNER.duration} linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;
