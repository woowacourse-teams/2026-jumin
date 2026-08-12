/** 현재 위치 측위와 그 결과. 측위에 성공하면 지도를 그 위치로 되돌리는 신호도 함께 올린다. */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

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
  const [locating, setLocating] = useState(false);
  const [mapFocusToken, setMapFocusToken] = useState(0);
  const [locationError, setLocationError] = useState<LocationErrorState | null>(null);

  const value = useMemo<LocationValue>(
    () => ({
      currentLocation,
      locating,
      mapFocusToken,
      locationError,
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
    [currentLocation, locating, mapFocusToken, locationError, setSession],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
};
