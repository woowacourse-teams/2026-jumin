import { css } from '@emotion/css';
import { Suspense, useLayoutEffect, useState } from 'react';
import { Outlet, useLocation, useMatch } from 'react-router';

import { RouteLoadingFallback } from '../components/service/RouteLoadingFallback';
import { PmfSurveyModal } from '../components/service/pmfSurvey/PmfSurveyModal';
import { STEP_PATH } from '../hooks/useStepNavigation';
import { NaverMap } from './NaverMap';
import { parseCoordinates } from '../utils/parseCoordinates';

const DEFAULT_MAP_CENTER = {
  latitude: 37.4981,
  longitude: 127.0279,
};

export const MapLayout = () => {
  const [map, setMap] = useState<naver.maps.Map | null>(null);
  const { search, pathname } = useLocation();
  const isSetupPage = useMatch(STEP_PATH.setup) !== null;

  const params = new URLSearchParams(search);

  const destination = parseCoordinates(params.get('lat'), params.get('lng'));
  const initialCenter = destination ?? DEFAULT_MAP_CENTER;
  const latitude = destination?.latitude;
  const longitude = destination?.longitude;

  // 설정 페이지의 코드 로딩을 기다리지 않고, 추천 화면의 카메라 보정은 건드리지 않는다.
  useLayoutEffect(() => {
    if (!map || !isSetupPage || latitude === undefined || longitude === undefined) {
      return;
    }

    const center = map.getCenter() as naver.maps.LatLng;
    if (center.lat() === latitude && center.lng() === longitude) return;

    map.setCenter(new naver.maps.LatLng(latitude, longitude));
  }, [map, isSetupPage, latitude, longitude]);

  return (
    <div className={layoutStyle}>
      <NaverMap
        initialLatitude={initialCenter.latitude}
        initialLongitude={initialCenter.longitude}
        onMapReady={setMap}
      />
      {/* 경로 전환에서는 이전 페이지를 대체하되, 같은 페이지의 검색 조건 변경은 유지한다. */}
      <Suspense key={pathname} fallback={<RouteLoadingFallback />}>
        <Outlet context={{ map }} />
      </Suspense>
      <PmfSurveyModal />
    </div>
  );
};

const layoutStyle = css`
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
`;
