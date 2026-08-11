import { Global, css } from '@emotion/react';
import styled from '@emotion/styled';
import { type ReactNode, useEffect, useRef } from 'react';
import { navHome, navNearby, navRecent } from './assets';

export const colors = {
  primary: '#4356d8',
  pressed: '#1249c4',
  accent: '#155eef',
  tint: '#eaf2ff',
  text: '#14213d',
  muted: '#8a94a2',
  line: '#edf0f4',
  surface: '#ffffff',
  background: '#f3f6fa',
  danger: '#c93434',
};

export const GlobalStyles = () => (
  <Global
    styles={css`
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

export const AppShell = styled.main`
  position: relative;
  width: min(100%, 390px);
  min-height: 100dvh;
  margin: 0 auto;
  overflow: hidden;
  background: ${colors.surface};
  box-shadow: 0 0 32px rgba(20, 33, 61, 0.1);

  @media (max-width: 390px) {
    box-shadow: none;
  }
`;

export const Screen = styled.section<{ bottomNav?: boolean }>`
  min-height: 100dvh;
  padding-bottom: ${({ bottomNav }) => (bottomNav ? 'calc(82px + env(safe-area-inset-bottom))' : 'env(safe-area-inset-bottom)')};
  background: ${colors.surface};
`;

export const Content = styled.div`
  padding: 20px;
`;

export const HeaderBar = styled.header`
  position: relative;
  z-index: 4;
  display: flex;
  min-height: calc(56px + env(safe-area-inset-top));
  align-items: flex-end;
  gap: 4px;
  padding: env(safe-area-inset-top) 12px 0;
  background: rgba(255, 255, 255, 0.96);
`;

export const HeaderTitle = styled.h1`
  min-width: 0;
  margin: 0;
  padding: 16px 0;
  overflow: hidden;
  font-size: 15px;
  font-weight: 800;
  line-height: 22px;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const IconButton = styled.button`
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  place-items: center;
  border: 0;
  border-radius: 12px;
  background: transparent;
  font-size: 25px;

  &:active {
    background: ${colors.background};
  }
`;

export const Header = ({ title, onBack }: { title: string; onBack: () => void }) => (
  <HeaderBar>
    <IconButton type="button" aria-label="뒤로 가기" onClick={onBack}>
      ‹
    </IconButton>
    <HeaderTitle>{title}</HeaderTitle>
  </HeaderBar>
);

export const PrimaryButton = styled.button`
  width: 100%;
  min-height: 58px;
  padding: 14px 18px;
  border: 0;
  border-radius: 16px;
  background: ${colors.primary};
  color: #fff;
  font-weight: 800;
  font-size: 16px;

  &:active:not(:disabled) {
    background: ${colors.pressed};
  }

  &:disabled {
    background: #c4ccd8;
    cursor: not-allowed;
  }
`;

export const SecondaryButton = styled.button`
  min-height: 44px;
  padding: 10px 16px;
  border: 1px solid ${colors.line};
  border-radius: 12px;
  background: ${colors.surface};
  color: ${colors.accent};
  font-weight: 700;

  &:active:not(:disabled) {
    background: ${colors.tint};
  }

  &:disabled {
    color: #a4a9b7;
    cursor: not-allowed;
  }
`;

export const BottomDock = styled.div`
  position: fixed;
  z-index: 8;
  bottom: 0;
  width: min(100%, 390px);
  padding: 20px 20px calc(20px + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 -8px 24px rgba(20, 33, 61, 0.06);
`;

const Nav = styled.nav`
  position: fixed;
  z-index: 7;
  bottom: 0;
  display: grid;
  width: min(100%, 390px);
  height: calc(84px + env(safe-area-inset-bottom));
  grid-template-columns: repeat(3, 1fr);
  padding-bottom: env(safe-area-inset-bottom);
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

const Scrim = styled.div`
  position: fixed;
  z-index: 20;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(20, 33, 61, 0.42);
`;

const Sheet = styled.div`
  width: min(100%, 390px);
  max-height: min(82dvh, 720px);
  padding: 10px 20px calc(24px + env(safe-area-inset-bottom));
  overflow: auto;
  border-radius: 24px 24px 0 0;
  background: ${colors.surface};
  box-shadow: 0 -14px 40px rgba(25, 34, 70, 0.2);
`;

const Handle = styled.div`
  width: 44px;
  height: 4px;
  margin: 0 auto 18px;
  border-radius: 999px;
  background: #dce4f0;
`;

export const DialogTitle = styled.h2`
  margin: 0 0 18px;
  font-size: 22px;
  line-height: 30px;
`;

export const DialogSheet = ({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);

  useEffect(() => {
    const sheet = ref.current;
    const triggerElement = trigger.current;
    const focusable = () =>
      Array.from(
        sheet?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]',
        ) ?? [],
      );
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      triggerElement?.focus();
    };
  }, [onClose]);

  return (
    <Scrim role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <Sheet ref={ref} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <Handle />
        <DialogTitle id="dialog-title">{title}</DialogTitle>
        {children}
      </Sheet>
    </Scrim>
  );
};

export const ErrorText = styled.p`
  margin: 8px 0 0;
  color: ${colors.danger};
  font-size: 13px;
  line-height: 19px;
`;

export const Muted = styled.p`
  margin: 0;
  color: ${colors.muted};
  font-size: 14px;
  line-height: 21px;
`;

export const Badge = styled.span`
  display: inline-flex;
  min-height: 25px;
  align-items: center;
  padding: 4px 9px;
  border-radius: 999px;
  background: ${colors.tint};
  color: ${colors.primary};
  font-size: 12px;
  font-weight: 800;
`;

export const LoadingBlock = styled.div`
  display: grid;
  min-height: 180px;
  place-items: center;
  color: ${colors.muted};
  font-size: 14px;
`;
