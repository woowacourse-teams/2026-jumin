import { css } from '@emotion/css';
import { Suspense, useState } from 'react';
import { Outlet, useLocation } from 'react-router';

import { RouteLoadingFallback } from '../components/service/RouteLoadingFallback';
import { NaverMap } from './NaverMap';

const DEFAULT_MAP_CENTER = {
  latitude: 37.4981,
  longitude: 127.0279,
};

export const MapLayout = () => {
  const [map, setMap] = useState<naver.maps.Map | null>(null);
  const { pathname } = useLocation();

  return (
    <div className={layoutStyle}>
      <NaverMap
        latitude={DEFAULT_MAP_CENTER.latitude}
        longitude={DEFAULT_MAP_CENTER.longitude}
        onMapReady={setMap}
      />
      {/* 경로 전환에서는 이전 페이지를 대체하되, 같은 페이지의 검색 조건 변경은 유지한다. */}
      <Suspense key={pathname} fallback={<RouteLoadingFallback />}>
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
