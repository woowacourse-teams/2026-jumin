import { css } from '@emotion/css';
import { useState } from 'react';
import { Outlet } from 'react-router';

import { NaverMap } from './NaverMap';

const DEFAULT_MAP_CENTER = {
  latitude: 37.4981,
  longitude: 127.0279,
};

export const MapLayout = () => {
  const [map, setMap] = useState<naver.maps.Map | null>(null);

  return (
    <div className={layoutStyle}>
      <NaverMap
        latitude={DEFAULT_MAP_CENTER.latitude}
        longitude={DEFAULT_MAP_CENTER.longitude}
        onMapReady={setMap}
      />
      <Outlet context={{ map }} />
    </div>
  );
};

const layoutStyle = css`
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
`;
