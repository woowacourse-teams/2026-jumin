import { injectGlobal } from '@emotion/css';
import { color } from '../../src/theme/color';

export const applyGlobalStyles = () => injectGlobal`
  * {
    box-sizing: border-box;
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
