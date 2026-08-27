import { css } from '@emotion/css';
import { useState } from 'react';
import { Outlet } from 'react-router';

import { NaverMap } from './NaverMap';

export const MapLayout = () => {
  const [map, setMap] = useState<naver.maps.Map | null>(null);

  return (
    <div className={layoutStyle}>
      <NaverMap onMapReady={setMap} />
      <Outlet context={map} />
    </div>
  );
};

const layoutStyle = css`
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
`;
