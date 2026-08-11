/** 하단 전역 내비게이션. */

import styled from '@emotion/styled';
import { navHome, navNearby, navRecent } from '../assets';

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
