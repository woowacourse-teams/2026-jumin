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

  /* 기기에서는 화면을 꽉 채우므로 그림자를 지운다. 데스크톱 웹에서만 보인다. */
  @media (max-width: 440px) {
    box-shadow: none;
  }
`;

export const Screen = styled.section<{ bottomNav?: boolean }>`
  min-height: 100dvh;
  padding-bottom: ${({ bottomNav }) => (bottomNav ? 'var(--nav-height)' : 'var(--safe-bottom)')};
  background: ${colors.surface};
`;

export const Content = styled.div`
  padding: var(--gutter);
`;

export const BottomDock = styled.div`
  position: fixed;
  z-index: 8;
  right: 0;
  bottom: 0;
  left: 0;
  width: min(100%, var(--app-max-width));
  margin: 0 auto;
  padding: var(--gutter) var(--gutter) calc(var(--gutter) + var(--safe-bottom));
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 -8px 24px rgba(20, 33, 61, 0.06);
`;
