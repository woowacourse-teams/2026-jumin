import { css } from '@emotion/css';
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router';

import { NaverMap } from './NaverMap';
import type { ParkingSetupView, RecommendView } from '../types/navigation';
import type { Destination } from '../../api/contracts';

const DEFAULT_MAP_CENTER = {
  latitude: 37.4981,
  longitude: 127.0279,
};

interface ParkingSetupNavigationState {
  destination?: Destination;
  setupView?: ParkingSetupView;
}

export const MapLayout = () => {
  const { pathname, state } = useLocation();

  const [initialCenter] = useState(() => {
    if (pathname !== '/parkingsetup') {
      return DEFAULT_MAP_CENTER;
    }

    const navigationState = state as ParkingSetupNavigationState | null;

    const destination = navigationState?.destination;

    return (
      navigationState?.setupView?.selectedLocation ??
      (destination
        ? {
            latitude: destination.latitude,
            longitude: destination.longitude,
          }
        : DEFAULT_MAP_CENTER)
    );
  });

  const [map, setMap] = useState<naver.maps.Map | null>(null);
  const [recommendView, setRecommendView] = useState<RecommendView | null>(null);

  return (
    <div className={layoutStyle}>
      <NaverMap
        latitude={initialCenter.latitude}
        longitude={initialCenter.longitude}
        onMapReady={setMap}
      />
      <Outlet context={{ map, recommendView, setRecommendView }} />
    </div>
  );
};

const layoutStyle = css`
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
`;
