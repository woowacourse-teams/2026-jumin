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
