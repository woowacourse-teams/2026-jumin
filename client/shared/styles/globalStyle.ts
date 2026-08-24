import { injectGlobal } from '@emotion/css';

export const applyGlobalStyles = () => injectGlobal`
    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      min-height: 100%;
    }

    body {
      min-height: 100dvh;
      background-color: #eef2f7;
    }

    #root {
      position: relative;

      width: min(390px, 100vw);
      height: min(844px, 100dvh);
      margin: 0 auto;
      overflow: hidden;


      background-position: center;
      background-size: cover;
      background-repeat: no-repeat;

      border-radius: 28px;
    }

  `;
