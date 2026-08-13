/** 현재 위치 측위와 그 결과. 측위에 성공하면 지도를 그 위치로 되돌리는 신호도 함께 올린다. */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { EMPTY_SESSION, initialNearbyVisit, type Coordinate } from '../domain';
import { requestCurrentLocation, type LocationResult } from '../platform';
import { navigate } from '../router';
import { useSearchSession } from './SearchSessionProvider';

export interface LocationErrorState {
  result: LocationResult;
  /** 실패한 요청이 '주변' 흐름이었는지. 재시도 때 같은 흐름을 이어간다. */
  nearby: boolean;
}

interface LocationValue {
  currentLocation: Coordinate | null;
  locating: boolean;
  /** 값이 바뀔 때마다 지도가 현재 위치로 카메라를 되돌린다. */
  mapFocusToken: number;
  locationError: LocationErrorState | null;
  /** nearby가 true면 측위 후 현재 위치 기준 방문 시간 화면으로 이동한다. */
  locate: (nearby: boolean) => Promise<void>;
  dismissLocationError: () => void;
  /** 앱을 켜면서 한 번 하는 측위가 끝났는지. 스플래시를 언제 걷을지 정하는 데 쓴다. */
  launchLocated: boolean;
}

const LocationContext = createContext<LocationValue | null>(null);

export const useLocation = () => {
  const value = useContext(LocationContext);
  if (!value) throw new Error('LocationProvider 안에서만 사용할 수 있습니다.');
  return value;
};

export const LocationProvider = ({ children }: { children: ReactNode }) => {
  const { setSession } = useSearchSession();
  const [currentLocation, setCurrentLocation] = useState<Coordinate | null>(null);
  // 앱을 켜자마자 측위를 시작하므로 처음부터 '찾는 중'이다.
  const [locating, setLocating] = useState(true);
  const [mapFocusToken, setMapFocusToken] = useState(0);
  const [locationError, setLocationError] = useState<LocationErrorState | null>(null);
  const [launchLocated, setLaunchLocated] = useState(false);

  // 앱을 켤 때 한 번 위치 권한을 묻고 현재 위치를 잡는다. 홈 지도가 기본 위치로 시작하지 않도록.
  useEffect(() => {
    let cancelled = false;
    void requestCurrentLocation().then((result) => {
      if (cancelled) return;
      setLocating(false);
      if (result.status === 'GRANTED') {
        setCurrentLocation(result.location);
        setMapFocusToken((token) => token + 1);
      }
      // 첫 진입에서 거절해도 안내 시트는 띄우지 않는다. 홈은 기본 위치로 보여주고,
      // 사용자가 '현재 위치로 이동'을 직접 누를 때만 안내한다.
      setLaunchLocated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<LocationValue>(
    () => ({
      currentLocation,
      locating,
      mapFocusToken,
      locationError,
      launchLocated,
      dismissLocationError: () => setLocationError(null),
      locate: async (nearby: boolean) => {
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
      },
    }),
    [currentLocation, locating, mapFocusToken, locationError, launchLocated, setSession],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
};
