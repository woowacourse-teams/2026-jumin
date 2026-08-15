/** 전역 스타일과 CSS 변수. 시안 기준 390x844 를 기기 폭에 맞춰 늘린다. */

import { Global, css } from '@emotion/react';

import { colors } from './tokens';

export const GlobalStyles = () => (
  <Global
    styles={css`
      /*
       * 시안 기준: MOBILE 390 x 844.
       * 폭은 기기에 따라 늘어나되(SE 375 ~ Pro Max 430) 여백·높이는 토큰으로 고정한다.
       */
      :root {
        --app-max-width: 440px;
        /* 좌측 레일과 패널. 모바일에서는 패널이 화면 전체다. */
        --rail-width: 0px;
        --panel-width: 100%;
        /* 지도가 시작하는 x 좌표. 레일과 패널을 합친 값이다. */
        --panel-total: calc(var(--rail-width) + var(--panel-width));
        --safe-top: env(safe-area-inset-top, 0px);
        --safe-bottom: env(safe-area-inset-bottom, 0px);
        --header-height: calc(56px + var(--safe-top));
        --nav-height: calc(84px + var(--safe-bottom));
        --gutter: clamp(16px, 5.1vw, 20px);
        --radius-sheet: 24px;
        --radius-card: 16px;
        --radius-control: 12px;
        --font-title: clamp(19px, 5.6vw, 22px);
        --font-section: clamp(15px, 4.3vw, 17px);
        --font-body: 15px;
        --font-caption: 13px;
      }

      /* 태블릿: 왼쪽 패널 + 오른쪽 지도 */
      @media (min-width: 768px) {
        :root {
          --app-max-width: 100%;
          --panel-width: 360px;
          --gutter: 20px;
        }
      }

      /* 데스크톱: 아이콘 레일 + 패널 + 지도. 하단 내비게이션이 레일로 바뀌므로 높이를 0으로 둔다. */
      @media (min-width: 1280px) {
        :root {
          --rail-width: 76px;
          --panel-width: 400px;
          --nav-height: 0px;
        }
      }
      * {
        box-sizing: border-box;
      }
      html,
      body,
      #root {
        width: 100%;
        min-height: 100%;
        margin: 0;
      }
      html {
        background: #edf0f4;
      }
      body {
        background: #edf0f4;
        color: ${colors.text};
        font-family:
          Pretendard,
          -apple-system,
          BlinkMacSystemFont,
          'Apple SD Gothic Neo',
          'Noto Sans KR',
          sans-serif;
        -webkit-font-smoothing: antialiased;
        overscroll-behavior: none;
      }
      html.native-map-visible,
      html.native-map-visible body,
      html.native-map-visible #root,
      html.native-map-visible main,
      html.native-map-visible section {
        background: transparent;
      }
      button,
      input,
      select {
        color: inherit;
        font: inherit;
      }
      button {
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      button:focus-visible,
      input:focus-visible,
      select:focus-visible,
      a:focus-visible {
        outline: 3px solid rgba(67, 86, 216, 0.35);
        outline-offset: 2px;
      }
      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          scroll-behavior: auto !important;
          transition: none !important;
        }
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `}
  />
);
