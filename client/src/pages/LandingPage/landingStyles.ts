import { css } from '@emotion/css';

import { color } from '../../theme/color';
import { typography } from '../../theme/typography';

export const MOBILE = '@media (max-width: 700px)';
export const TABLET = '@media (max-width: 1000px)';

/** 랜딩 섹션들이 함께 쓰는 레이아웃·제목·버튼 스타일. */
export const landing = {
  container: css`
    width: min(100% - 96px, 1160px);
    margin: 0 auto;
    ${MOBILE} {
      width: calc(100% - 40px);
    }
  `,
  section: css`
    padding: 128px 0;
    ${MOBILE} {
      padding: 80px 0;
    }
  `,
  eyebrow: css`
    ${typography.label};
    color: ${color.text.brand};
  `,
  title: css`
    margin-top: 16px !important;
    font-size: clamp(1.75rem, 3.4vw, 2.75rem);
    line-height: 1.35;
    font-weight: 800;
    letter-spacing: -1.4px;
  `,
  lead: css`
    margin-top: 20px !important;
    ${typography.body};
    line-height: 1.8;
    color: ${color.text.secondary};
    ${MOBILE} {
      font-size: 0.9375rem;
    }
  `,
  button: css`
    display: inline-flex;
    min-height: 56px;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 0 26px;
    border: 1px solid transparent;
    border-radius: 12px;
    ${typography.label};
    font-size: 0.9375rem;
    cursor: pointer;
    transition:
      background 160ms ease,
      transform 160ms ease;
    &:active {
      transform: scale(0.98);
    }
    &:disabled {
      cursor: default;
      opacity: 0.6;
    }
  `,
  primaryButton: css`
    color: ${color.text.inverse} !important;
    background: ${color.background.brand};
    &:hover {
      background: ${color.background.brandHovered};
    }
  `,
};
