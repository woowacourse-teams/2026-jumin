import { injectGlobal } from '@emotion/css';
import { color } from '../../theme/color';

export const applyGlobalStyles = () => injectGlobal`
  * {
    box-sizing: border-box;
  }

  :root {
    --focus-ring-width: 2px;
    --focus-ring-offset: 0px;
    --focus-ring-color: ${color.focus.ring};
  }

  html,
  body {
    width: 100%;
    height: 100%;
    margin: 0;
  }

  body {
    overflow: hidden;
    background: ${color.background.subtle};
  }

  :where(button, a[href], input, textarea, select, summary, [tabindex], [contenteditable='true']):focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring-color);
    outline-offset: var(--focus-ring-offset);
  }

  /* 움직임 줄이기를 켠 사용자에게는 모든 전환과 애니메이션을 끝 상태로 바로 보여 준다. */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      transition-duration: 0.01ms !important;
      transition-delay: 0s !important;
      animation-duration: 0.01ms !important;
      animation-delay: 0s !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
    }
  }

  #root {
    --bottom-nav-height: 86px;

    position: relative;
    width: 100%;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
  }

  @media (display-mode: standalone) {
  #root {
    height: 100vh;
  }
}

  @media (min-width: 431px) and (hover: hover) and (pointer: fine) {
    body {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    #root {
      max-width: 430px;
      height: min(844px, 100dvh);
      margin: 0 auto;
      border-radius: 28px;
    }
  }
`;
