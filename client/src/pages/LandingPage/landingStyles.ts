import { css } from '@emotion/css';

import { color } from '../../theme/color';
import { typography } from '../../theme/typography';

export const MOBILE = '@media (max-width: 700px)';
export const TABLET = '@media (max-width: 1000px)';
export const REDUCE_MOTION = '@media (prefers-reduced-motion: reduce)';

/** 상단 고정 헤더 높이(px). 히어로 높이와 앵커 여백 계산에 함께 쓴다. */
export const HEADER_HEIGHT = 64;

/** 토스풍의 부드럽게 감속하는 전환 곡선. */
export const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

/** 랜딩 섹션들이 함께 쓰는 레이아웃·제목·버튼 스타일. */
export const landing = {
  container: css`
    width: min(100% - 96px, 1120px);
    margin: 0 auto;
    ${MOBILE} {
      width: calc(100% - 40px);
    }
  `,
  section: css`
    padding: 160px 0;
    ${MOBILE} {
      padding: 96px 0;
    }
  `,
  eyebrow: css`
    ${typography.label};
    font-size: 1rem;
    color: ${color.text.brand};
    ${MOBILE} {
      font-size: 0.875rem;
    }
  `,
  title: css`
    margin-top: 14px !important;
    font-size: clamp(1.875rem, 4.4vw, 3.5rem);
    line-height: 1.3;
    font-weight: 800;
    letter-spacing: -0.03em;
  `,
  lead: css`
    margin-top: 24px !important;
    font-size: clamp(1rem, 1.5vw, 1.25rem);
    line-height: 1.7;
    font-weight: 500;
    color: ${color.text.secondary};
  `,
  button: css`
    display: inline-flex;
    min-height: 56px;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 0 28px;
    border: 1px solid transparent;
    border-radius: 16px;
    ${typography.label};
    font-size: 1.0625rem;
    cursor: pointer;
    transition:
      background 200ms ease,
      box-shadow 300ms ease,
      transform 300ms ${EASE_OUT};
    &:active {
      transform: scale(0.97);
    }
    &:disabled {
      cursor: default;
      opacity: 0.6;
    }
  `,
  primaryButton: css`
    color: ${color.text.inverse} !important;
    background: ${color.background.brand};
    box-shadow: 0 12px 28px -12px rgb(67 86 216 / 70%);
    &:hover {
      background: ${color.background.brandHovered};
      box-shadow: 0 18px 36px -12px rgb(67 86 216 / 75%);
      transform: translateY(-2px);
    }
    &:active {
      transform: scale(0.97);
    }
  `,
};
