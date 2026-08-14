/** 화면 뼈대. 앱 폭·안전영역·하단 고정 영역을 책임진다. */

import styled from '@emotion/styled';

import { colors } from './tokens';

export const AppShell = styled.main`
  position: relative;
  width: min(100%, var(--app-max-width));
  min-height: 100dvh;
  margin: 0 auto;
  overflow: hidden;
  background: ${colors.surface};
  box-shadow: 0 0 32px rgba(20, 33, 61, 0.1);

  /* 기기에서는 화면을 꽉 채우므로 그림자를 지운다. */
  @media (max-width: 440px) {
    box-shadow: none;
  }

  /* 넓은 화면에서는 가운데 정렬을 풀고 화면 전체를 쓴다. */
  @media (min-width: 768px) {
    width: 100%;
    box-shadow: none;
  }
`;

export const Screen = styled.section<{ bottomNav?: boolean }>`
  min-height: 100dvh;
  padding-bottom: ${({ bottomNav }) => (bottomNav ? 'var(--nav-height)' : 'var(--safe-bottom)')};
  background: ${colors.surface};

  /*
   * 분할 레이아웃에서는 화면 자체가 좌표계가 된다.
   * 지도는 오른쪽 칸에 절대 배치되고, 나머지 요소는 왼쪽 패널 폭으로 묶인다.
   */
  @media (min-width: 768px) {
    position: relative;
    height: 100dvh;
    min-height: 0;
    padding-bottom: 0;
    overflow: hidden;
    /* 지도가 없는 화면에서 패널 오른쪽이 빈 흰 판으로 보이지 않게 한다. */
    background: ${colors.background};
  }
`;

/**
 * 지도가 없는 화면에서 흐름 콘텐츠를 담는 왼쪽 패널.
 * 레일 폭만큼 밀어내지 않으면 데스크톱에서 내용이 레일 뒤로 숨는다.
 */
export const PanelBody = styled.div`
  @media (min-width: 768px) {
    width: var(--panel-width);
    height: calc(100dvh - var(--header-height) - var(--nav-height));
    margin-left: var(--rail-width);
    overflow-y: auto;
    overscroll-behavior: contain;
    background: ${colors.surface};
  }
`;

export const Content = styled.div`
  padding: var(--gutter);
`;

export const BottomDock = styled.div`
  position: fixed;
  z-index: 8;
  right: 0;
  /* 하단 내비게이션은 모든 화면에 있으므로 그 위에 놓는다. */
  bottom: var(--nav-height);
  left: 0;
  width: min(100%, var(--app-max-width));
  margin: 0 auto;
  padding: var(--gutter);
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 -8px 24px rgba(20, 33, 61, 0.06);

  /* 도크는 지도가 아니라 패널에 속한다. */
  @media (min-width: 768px) {
    right: auto;
    left: var(--rail-width);
    width: var(--panel-width);
    margin: 0;
  }
`;
