import { css } from '@emotion/css';
import { useState } from 'react';
import { Outlet } from 'react-router';

import { NaverMap } from './NaverMap';
import type { RecommendView } from '../types/navigation';

export const MapLayout = () => {
  const [map, setMap] = useState<naver.maps.Map | null>(null);
  const [recommendView, setRecommendView] = useState<RecommendView | null>(null);

  return (
    <div className={layoutStyle}>
      <NaverMap latitude={37.4981} longitude={127.0279} onMapReady={setMap} />
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
