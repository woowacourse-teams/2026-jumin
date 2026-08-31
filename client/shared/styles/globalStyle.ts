import { injectGlobal } from '@emotion/css';

export const applyGlobalStyles = () => injectGlobal`
    * {
      box-sizing: border-box;
    }

    html,
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0;
      width: 100%;
      height: 100%;
      min-height: 100%;
    }

    body {
      min-height: 100dvh;
      overflow: hidden;
      background-color: #eef2f7;
    }

    #root {
      position: relative;
      width: 100%;
      max-width: 430px;
      height: 100dvh;
      margin: 0 auto;
      overflow: hidden;
    }

    @media (min-width: 431px) {
      #root {
        height: min(844px, 100dvh);
      border-radius: 28px;
      }
    }
  `;
