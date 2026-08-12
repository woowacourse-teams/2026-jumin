/** 앱 셸. 라우팅과 오버레이 노출만 담당한다. 화면별 상태는 각 화면이 context 에서 직접 가져온다. */

import { useEffect, useState } from 'react';
import { keyframes } from '@emotion/react';
import styled from '@emotion/styled';

import { picoLogo } from '../assets';
import { AppShell, colors, GlobalStyles, LoadingBlock } from '../components';
import { AppProviders, useLocation, useOverlay, useSearchSession } from '../contexts';
import { runDomainSelfCheck } from '../domain';
import { exitNativeApp, registerNativeBack } from '../platform';
import { navigate, useRoute } from '../router';
import { DestinationScreen } from '../screens/destination';
import { DetailScreen } from '../screens/detail';
import { DirectionsSheet } from '../screens/directions';
import { HomeScreen } from '../screens/home';
import { LocationSheet } from '../screens/location';
import { MoreScreen } from '../screens/more';
import { RecentScreen } from '../screens/recent';
import { ResultsScreen } from '../screens/results';
import { SearchScreen } from '../screens/search';
import { CalendarSheet, TimePicker, VisitScreen } from '../screens/visit';

export const Splash = styled.div`
  position: relative;
  display: grid;
  min-height: 100dvh;
  place-items: center;
  padding: env(safe-area-inset-top) 20px env(safe-area-inset-bottom);
  background: ${colors.primary};
`;

/** 로고와 워드마크를 한 덩어리로 묶어 화면 정중앙에 놓는다. */
export const SplashBrand = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const SplashLogo = styled.img`
  display: block;
  width: 86px;
  height: 96px;
`;

export const SplashWordmark = styled.strong`
  margin-top: 34px;
  color: #fff;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
`;

const splashDotBlink = keyframes`
  0%,
  70%,
  100% {
    opacity: 0.35;
  }
  35% {
    opacity: 1;
  }
`;

/** 로딩 중임을 알리는 점 세 개. 순서대로 밝아진다. */
export const SplashDots = styled.div`
  position: absolute;
  right: 0;
  bottom: calc(76px + env(safe-area-inset-bottom));
  left: 0;
  display: flex;
  justify-content: center;
  gap: 10px;

  span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #fff;
    opacity: 0.35;
    animation: ${splashDotBlink} 1.2s ease-in-out infinite;
  }
  span:nth-of-type(2) {
    animation-delay: 0.16s;
  }
  span:nth-of-type(3) {
    animation-delay: 0.32s;
  }

  /* 움직임을 줄이는 설정에서는 애니메이션 대신 밝기 차이만 남긴다. */
  @media (prefers-reduced-motion: reduce) {
    span {
      animation: none;
    }
    span:nth-of-type(1) {
      opacity: 1;
    }
    span:nth-of-type(2) {
      opacity: 0.55;
    }
  }
`;

export const LocatingToast = styled.div`
  position: fixed;
  z-index: 9;
  right: 0;
  bottom: calc(104px + var(--safe-bottom));
  left: 0;
  width: fit-content;
  margin: 0 auto;
  padding: 10px 16px;
  border-radius: 999px;
  background: rgba(20, 33, 61, 0.88);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
`;

/** 잘못 인코딩된 주소(`/parking-lots/%`)로 들어와도 URIError 로 앱이 죽지 않게 한다. */
const decodeSegment = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return '';
  }
};

/** 현재 라우트에 맞는 화면 하나를 고른다. 진입 조건을 만족하지 못하면 안전한 화면으로 돌려보낸다. */
const useCurrentPage = (ready: boolean) => {
  const route = useRoute();
  const { session } = useSearchSession();

  useEffect(() => {
    const path = route.route;
    if (path === '/destination' && !session.destination) navigate('/search', { replace: true });
    else if (path === '/visit' && (!session.destination || !session.visitDraft)) navigate('/', { replace: true });
    else if (path === '/results' && !session.response) navigate('/', { replace: true });
    else if (path === '/parking-lots' && !session.response) navigate('/', { replace: true });
    else if (path === '/parking-lots' && session.response && !session.response.parkingLots.length)
      navigate('/results', { replace: true });
    else if (
      !['/', '/search', '/destination', '/visit', '/results', '/parking-lots', '/recent'].includes(path) &&
      !path.startsWith('/parking-lots/')
    )
      navigate('/', { replace: true });
  }, [route.route, session.destination, session.response, session.visitDraft]);

  if (!ready)
    return (
      <Splash role="status" aria-label="주차의 민족을 준비하고 있어요">
        <SplashBrand>
          {/* 바로 아래 워드마크가 이름을 읽어주므로 이미지는 장식으로 둔다. */}
          <SplashLogo src={picoLogo} alt="" />
          <SplashWordmark>주차의 민족</SplashWordmark>
        </SplashBrand>
        <SplashDots aria-hidden="true">
          <span />
          <span />
          <span />
        </SplashDots>
      </Splash>
    );
  if (route.route === '/') return <HomeScreen />;
  if (route.route === '/search') return <SearchScreen />;
  if (route.route === '/destination' && session.destination) return <DestinationScreen />;
  if (route.route === '/visit' && session.destination && session.visitDraft) return <VisitScreen />;
  if (route.route === '/results' && session.response) return <ResultsScreen />;
  if (route.route === '/parking-lots' && session.response?.parkingLots.length) return <MoreScreen />;
  if (route.route === '/recent') return <RecentScreen />;
  if (route.route.startsWith('/parking-lots/')) {
    const id = decodeSegment(route.route.slice('/parking-lots/'.length));
    // key 로 주차장을 바꾸면 화면 상태가 함께 초기화된다. 이전 주차장 정보가 남아 보이지 않게 한다.
    if (id) return <DetailScreen key={id} parkingLotId={id} />;
  }
  return null;
};

/** 안드로이드 하드웨어 뒤로가기를 앱 히스토리에 연결한다. */
const useNativeBackButton = () => {
  const route = useRoute();
  useEffect(() => {
    let cancelled = false;
    let remove: (() => void) | null = null;
    void registerNativeBack(() => {
      if (route.overlay !== 'NONE') history.back();
      else if (route.route === '/' && route.appHistoryIndex === 0) void exitNativeApp();
      else history.back();
    }).then((cleanup) => {
      // 등록이 끝나기 전에 effect 가 정리됐다면 즉시 해제한다. 남겨두면 낡은 route 로 동작하는 핸들러가 쌓인다.
      if (cancelled) cleanup();
      else remove = cleanup;
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [route.appHistoryIndex, route.overlay, route.route]);
};

/** 앱을 켤 때 스플래시를 보여주는 시간. */
const SPLASH_DURATION_MS = 3_000;

const AppRoutes = () => {
  const route = useRoute();
  const [ready, setReady] = useState(false);
  const { session } = useSearchSession();
  const { locating, locationError } = useLocation();
  const { picker, directionsTarget } = useOverlay();

  useEffect(() => {
    if (!__APP_CONFIG__.isProduction) runDomainSelfCheck();
    const timer = window.setTimeout(() => setReady(true), SPLASH_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useNativeBackButton();
  const page = useCurrentPage(ready);

  return (
    <>
      <GlobalStyles />
      <AppShell>{page ?? <LoadingBlock css={{ minHeight: '100dvh' }}>화면을 준비하고 있어요…</LoadingBlock>}</AppShell>
      {locating && <LocatingToast role="status">현재 위치를 찾고 있어요…</LocatingToast>}
      {route.overlay === 'VISIT_DATE' && session.visitDraft && <CalendarSheet />}
      {route.overlay === 'VISIT_TIME_PICKER' && picker && <TimePicker />}
      {route.overlay === 'DIRECTIONS' && directionsTarget && <DirectionsSheet />}
      {locationError && <LocationSheet />}
    </>
  );
};

export const App = () => (
  <AppProviders>
    <AppRoutes />
  </AppProviders>
);

export default App;
