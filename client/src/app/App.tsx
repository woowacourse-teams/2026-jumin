/** 앱 셸. 라우팅과 오버레이 노출만 담당한다. 화면별 상태는 각 화면이 context 에서 직접 가져온다. */

import { useEffect, useState } from 'react';
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
  display: grid;
  min-height: 100dvh;
  place-items: center;
  padding: env(safe-area-inset-top) 20px env(safe-area-inset-bottom);
  background: ${colors.primary};
`;

export const SplashLogo = styled.img`
  display: block;
  width: 118px;
  height: 171px;
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
      <Splash>
        <SplashLogo src={picoLogo} alt="주차의 민족" />
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
    const id = decodeURIComponent(route.route.slice('/parking-lots/'.length));
    if (id) return <DetailScreen parkingLotId={id} />;
  }
  return null;
};

/** 안드로이드 하드웨어 뒤로가기를 앱 히스토리에 연결한다. */
const useNativeBackButton = () => {
  const route = useRoute();
  useEffect(() => {
    let remove = () => undefined;
    void registerNativeBack(() => {
      if (route.overlay !== 'NONE') history.back();
      else if (route.route === '/' && route.appHistoryIndex === 0) void exitNativeApp();
      else history.back();
    }).then((cleanup) => {
      remove = cleanup;
    });
    return () => remove();
  }, [route.appHistoryIndex, route.overlay, route.route]);
};

const AppRoutes = () => {
  const route = useRoute();
  const [ready, setReady] = useState(false);
  const { session } = useSearchSession();
  const { locating, locationError } = useLocation();
  const { picker, directionsTarget } = useOverlay();

  useEffect(() => {
    if (!__APP_CONFIG__.isProduction) runDomainSelfCheck();
    queueMicrotask(() => setReady(true));
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
