/** 앱 셸. 라우팅과 전역 상태를 화면에 연결한다. */

import { useEffect, useState } from 'react';
import styled from '@emotion/styled';

import { picoLogo } from '../assets';
import { AppShell, colors, GlobalStyles, LoadingBlock } from '../components';
import {
  EMPTY_SESSION,
  addVisitMinutes,
  initialNearbyVisit,
  loadRecentUses,
  nextTenMinuteSlot,
  runDomainSelfCheck,
  saveRecentUse,
  todayInSeoul,
  type Coordinate,
  type DestinationCandidate,
  type DirectionsProvider,
  type ParkingTarget,
  type RecentUse,
  type SearchSession,
} from '../domain';
import {
  exitNativeApp,
  openDirections,
  openNaverWebFallback,
  registerNativeBack,
  requestCurrentLocation,
  type LocationResult,
} from '../platform';
import { closeOverlay, navigate, openOverlay, useRoute } from '../router';
import { HomeScreen } from '../screens/home';
import { SearchScreen } from '../screens/search';
import { DestinationScreen } from '../screens/destination';
import { PickerState, TimePicker, VisitScreen } from '../screens/visit';
import { ResultsScreen } from '../screens/results';
import { MoreScreen } from '../screens/more';
import { DetailScreen } from '../screens/detail';
import { RecentScreen } from '../screens/recent';
import { DirectionsSheet } from '../screens/directions';
import { LocationSheet } from '../screens/location';

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

export const App = () => {
  const route = useRoute();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<SearchSession>(EMPTY_SESSION);
  const [currentLocation, setCurrentLocation] = useState<Coordinate | null>(null);
  const [locating, setLocating] = useState(false);
  // 같은 좌표를 다시 받아도 지도를 현재 위치로 되돌리기 위한 신호
  const [mapFocusToken, setMapFocusToken] = useState(0);
  const [locationError, setLocationError] = useState<{ result: LocationResult; nearby: boolean } | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [directionsTarget, setDirectionsTarget] = useState<ParkingTarget | null>(null);
  const [directionsError, setDirectionsError] = useState('');
  const [recent, setRecent] = useState<RecentUse[]>(loadRecentUses);

  useEffect(() => {
    if (!__APP_CONFIG__.isProduction) runDomainSelfCheck();
    queueMicrotask(() => setReady(true));
  }, []);

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

  const goHome = () => {
    setSession(EMPTY_SESSION);
    if (route.route !== '/') navigate('/');
  };
  const goRecent = () => {
    setRecent(loadRecentUses());
    if (route.route !== '/recent') navigate('/recent');
  };

  const locate = async (nearby: boolean) => {
    setLocating(true);
    setLocationError(null);
    const result = await requestCurrentLocation();
    setLocating(false);
    if (result.status !== 'GRANTED') {
      setLocationError({ result, nearby });
      return;
    }
    setCurrentLocation(result.location);
    setMapFocusToken((token) => token + 1);
    if (nearby) {
      setSession({
        ...EMPTY_SESSION,
        destination: { kind: 'NEARBY', name: '현재 위치', address: '현재 위치 주변', location: result.location },
        visitDraft: initialNearbyVisit(),
      });
      navigate('/visit');
    }
  };

  const selectDestination = (candidate: DestinationCandidate) => {
    setSession({
      ...EMPTY_SESSION,
      destination: {
        kind: 'SEARCH',
        destinationId: candidate.destinationId,
        name: candidate.name,
        address: candidate.roadAddress ?? candidate.address,
        roadAddress: candidate.roadAddress,
        location: { latitude: candidate.latitude, longitude: candidate.longitude },
      },
    });
    navigate('/destination');
  };

  const startSearchVisit = () => {
    setSession((value) => ({
      ...value,
      visitDraft: {
        source: 'SEARCH',
        visitDate: todayInSeoul(),
        entryTime: null,
        exitTime: null,
        nearbyExitWasEdited: false,
      },
      confirmedVisit: null,
      response: null,
      selectedParkingLotId: null,
    }));
    navigate('/visit');
  };

  const showTimePicker = (kind: PickerState['kind'], initial: string | null) => {
    const draft = session.visitDraft;
    const fallback =
      initial ??
      (kind === 'EXIT' && draft?.entryTime ? addVisitMinutes({ ...draft, exitTime: null }, 60)?.exitTime : null) ??
      nextTenMinuteSlot().time;
    const [hour = '00', minute = '00'] = fallback.split(':');
    setPicker({ kind, hour, minute: String(Math.floor(Number(minute) / 10) * 10).padStart(2, '0') });
    openOverlay('VISIT_TIME_PICKER');
  };

  const confirmPicker = () => {
    if (!picker) return;
    setSession((value) => {
      if (!value.visitDraft) return value;
      const time = `${picker.hour}:${picker.minute}`;
      return {
        ...value,
        visitDraft: {
          ...value.visitDraft,
          ...(picker.kind === 'ENTRY' ? { entryTime: time } : { exitTime: time }),
          nearbyExitWasEdited:
            value.visitDraft.nearbyExitWasEdited || (value.visitDraft.source === 'NEARBY' && picker.kind === 'EXIT'),
        },
      };
    });
    closeOverlay();
  };

  const showDirections = (target: ParkingTarget) => {
    setDirectionsTarget(target);
    setDirectionsError('');
    openOverlay('DIRECTIONS');
  };

  const dispatchDirections = async (provider: DirectionsProvider) => {
    if (!directionsTarget) return;
    const result = await openDirections(provider, directionsTarget);
    if (result.status === 'DISPATCHED') {
      saveRecentUse(directionsTarget);
      setRecent(loadRecentUses());
      setDirectionsTarget(null);
      closeOverlay();
    } else if (result.status === 'FALLBACK_OPENED') {
      setDirectionsTarget(null);
      closeOverlay();
    } else setDirectionsError('지도 앱을 열지 못했어요. 다른 앱을 선택해주세요.');
  };

  const openDetail = (id: string, origin: 'RESULTS' | 'PARKING_LOTS' | 'RECENT') =>
    navigate(`/parking-lots/${encodeURIComponent(id)}`, { detailOrigin: origin });

  const detailBack = () => {
    if (route.detailOrigin) history.back();
    else navigate('/', { replace: true });
  };

  let page: React.ReactNode = null;
  if (!ready)
    page = (
      <Splash>
        <SplashLogo src={picoLogo} alt="주차의 민족" />
      </Splash>
    );
  else if (route.route === '/')
    page = (
      <HomeScreen
        currentLocation={currentLocation}
        locating={locating}
        mapFocusToken={mapFocusToken}
        onSearch={() => navigate('/search')}
        onLocate={() => void locate(false)}
        onNearby={() => void locate(true)}
        onHome={goHome}
        onRecent={goRecent}
      />
    );
  else if (route.route === '/search')
    page = (
      <SearchScreen
        currentLocation={currentLocation}
        onSelect={selectDestination}
        onBack={() => navigate('/')}
        onNearby={() => void locate(true)}
        onHome={goHome}
        onRecent={goRecent}
      />
    );
  else if (route.route === '/destination' && session.destination)
    page = <DestinationScreen session={session} onBack={() => navigate('/search')} onNext={startSearchVisit} />;
  else if (route.route === '/visit' && session.destination && session.visitDraft)
    page = (
      <VisitScreen
        session={session}
        setSession={setSession}
        onBack={() => navigate(session.visitDraft?.source === 'SEARCH' ? '/destination' : '/')}
        onOpenPicker={showTimePicker}
      />
    );
  else if (route.route === '/results' && session.response)
    page = (
      <ResultsScreen
        session={session}
        setSession={setSession}
        onDetail={(id) => openDetail(id, 'RESULTS')}
        onMore={() => navigate('/parking-lots')}
        onNearby={() => void locate(true)}
        onHome={goHome}
        onRecent={goRecent}
      />
    );
  else if (route.route === '/parking-lots' && session.response?.parkingLots.length)
    page = (
      <MoreScreen
        session={session}
        setSession={setSession}
        onDetail={(id) => openDetail(id, 'PARKING_LOTS')}
        onDirections={showDirections}
      />
    );
  else if (route.route === '/recent')
    page = (
      <RecentScreen
        items={recent}
        onSelect={(id) => openDetail(id, 'RECENT')}
        onNearby={() => void locate(true)}
        onHome={goHome}
        onRecent={goRecent}
      />
    );
  else if (route.route.startsWith('/parking-lots/')) {
    const id = decodeURIComponent(route.route.slice('/parking-lots/'.length));
    if (id)
      page = (
        <DetailScreen
          parkingLotId={id}
          session={session}
          recent={recent}
          onBack={detailBack}
          onDirections={showDirections}
        />
      );
  }

  if (!page) page = <LoadingBlock css={{ minHeight: '100dvh' }}>화면을 준비하고 있어요…</LoadingBlock>;

  return (
    <>
      <GlobalStyles />
      <AppShell>{page}</AppShell>
      {locating && <LocatingToast role="status">현재 위치를 찾고 있어요…</LocatingToast>}
      {route.overlay === 'VISIT_TIME_PICKER' && picker && (
        <TimePicker picker={picker} onChange={setPicker} onConfirm={confirmPicker} onClose={closeOverlay} />
      )}
      {route.overlay === 'DIRECTIONS' && directionsTarget && (
        <DirectionsSheet
          target={directionsTarget}
          error={directionsError}
          onOpen={(provider) => void dispatchDirections(provider)}
          onFallback={() => {
            const result = openNaverWebFallback();
            if (result.status === 'FALLBACK_OPENED') closeOverlay();
          }}
          onClose={closeOverlay}
        />
      )}
      {locationError && (
        <LocationSheet
          result={locationError.result}
          onRetry={() => {
            const nearby = locationError.nearby;
            setLocationError(null);
            void locate(nearby);
          }}
          onSearch={() => {
            setLocationError(null);
            navigate('/search');
          }}
          onClose={() => setLocationError(null)}
        />
      )}
    </>
  );
};

export default App;
