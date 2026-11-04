import { css } from '@emotion/css';
import { Suspense, useState } from 'react';
import { Outlet, useLocation } from 'react-router';

import { NaverMap } from './NaverMap';
import { parseCoordinates } from '../utils/parseCoordinates';

const DEFAULT_MAP_CENTER = {
  latitude: 37.4981,
  longitude: 127.0279,
};

export const MapLayout = () => {
  const [map, setMap] = useState<naver.maps.Map | null>(null);
  const { search } = useLocation();

  const params = new URLSearchParams(search);

  const initialCenter =
    parseCoordinates(params.get('lat'), params.get('lng')) ?? DEFAULT_MAP_CENTER;

  return (
    <div className={layoutStyle}>
      <NaverMap
        latitude={initialCenter.latitude}
        longitude={initialCenter.longitude}
        onMapReady={setMap}
      />
      <Suspense fallback={<div role="status">페이지를 불러오는중...</div>}>
        <Outlet context={{ map }} />
      </Suspense>
    </div>
  );
};

const layoutStyle = css`
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
`;
