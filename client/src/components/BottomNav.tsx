/** 하단 전역 내비게이션. */

import styled from '@emotion/styled';
import { navHome, navNearby, navRecent, picoLogo } from '../assets';

import { colors } from './tokens';

const Nav = styled.nav`
  position: fixed;
  z-index: 7;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  width: min(100%, var(--app-max-width));
  height: var(--nav-height);
  margin: 0 auto;
  grid-template-columns: repeat(3, 1fr);
  padding-bottom: var(--safe-bottom);
  border-top: 1px solid ${colors.line};
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 -4px 9px rgba(20, 33, 61, 0.06);

  /* 태블릿: 지도가 아니라 왼쪽 패널 아래에 붙는다. */
  @media (min-width: 768px) {
    right: auto;
    left: var(--rail-width);
    width: var(--panel-width);
    margin: 0;
  }

  /* 데스크톱: 세로 아이콘 레일로 바뀐다. */
  @media (min-width: 1280px) {
    top: 0;
    bottom: 0;
    left: 0;
    width: var(--rail-width);
    height: 100dvh;
    align-content: start;
    gap: 4px;
    grid-template-columns: 1fr;
    grid-template-rows: auto;
    grid-auto-rows: auto;
    padding: 16px 0 0;
    border-top: 0;
    border-right: 1px solid ${colors.line};
    box-shadow: 4px 0 9px rgba(20, 33, 61, 0.04);
  }
`;

/** 데스크톱 레일 맨 위의 브랜드 마크. 좁은 화면에서는 감춘다. */
const RailLogo = styled.span`
  display: none;

  @media (min-width: 1280px) {
    display: grid;
    width: 40px;
    height: 40px;
    justify-self: center;
    margin-bottom: 14px;
    border-radius: 12px;
    background: ${colors.primary};
    place-items: center;
  }
`;

const RailLogoMark = styled.img`
  width: 20px;
  height: 22px;
`;

const NavButton = styled.button<{ active: boolean }>`
  display: flex;
  min-width: 44px;
  min-height: 56px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 5px;
  border: 0;
  background: transparent;
  color: ${({ active }) => (active ? colors.primary : colors.muted)};
  font-size: 11px;
  font-weight: ${({ active }) => (active ? 800 : 600)};
`;

const NavIcon = styled.span<{ source: string }>`
  width: 26px;
  height: 26px;
  background: currentColor;
  mask: url(${({ source }) => source}) center / contain no-repeat;
  -webkit-mask: url(${({ source }) => source}) center / contain no-repeat;
`;

export const BottomNav = ({
  active,
  onNearby,
  onHome,
  onRecent,
}: {
  active: 'NEARBY' | 'HOME' | 'RECENT';
  onNearby: () => void;
  onHome: () => void;
  onRecent: () => void;
}) => (
  <Nav aria-label="주요 메뉴">
    <RailLogo aria-hidden="true">
      <RailLogoMark src={picoLogo} alt="" />
    </RailLogo>
    <NavButton
      type="button"
      active={active === 'NEARBY'}
      aria-current={active === 'NEARBY' ? 'page' : undefined}
      onClick={onNearby}
    >
      <NavIcon aria-hidden source={navNearby} />
      <span>주변</span>
    </NavButton>
    <NavButton
      type="button"
      active={active === 'HOME'}
      aria-current={active === 'HOME' ? 'page' : undefined}
      onClick={onHome}
    >
      <NavIcon aria-hidden source={navHome} />
      <span>홈</span>
    </NavButton>
    <NavButton
      type="button"
      active={active === 'RECENT'}
      aria-current={active === 'RECENT' ? 'page' : undefined}
      onClick={onRecent}
    >
      <NavIcon aria-hidden source={navRecent} />
      <span>최근 이용</span>
    </NavButton>
  </Nav>
);
