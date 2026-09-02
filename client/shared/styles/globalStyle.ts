import { injectGlobal } from '@emotion/css';

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
  background: #eef2f7;
}

#root {
  position: relative;
  width: 100%;
  height: 100dvh;
  overflow: hidden;
}

@media (display-mode: standalone) {
  #root {
    height: 100vh;
  }
}

@media (min-width: 431px) {
  #root {
    max-width: 430px;
    height: min(844px, 100dvh);
    margin: 0 auto;
    border-radius: 28px;
  }
}
  `;
