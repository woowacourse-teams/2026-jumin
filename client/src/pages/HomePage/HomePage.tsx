import { useNavigate, useOutletContext } from 'react-router';
import { css } from '@emotion/css';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';

import currentLocationMarkerUrl from '../../../assets/icons/markers/currentLocation.svg';
import { useMapViewport } from './hooks/useMapViewport';
import BottomSheet, { BottomSheetSnap } from '../../../shared/components/BottomSheet';
import { ViewportParkingMarkers } from './components/ViewportParkingMarkers';
import { NaverMapMarker } from '../../../shared/maps/NaverMapMarker';
import { CurrentLocationButton } from './components/CurrentLocationButton';
import { BottomNav } from '../../../shared/components/BottomNav';
import { SearchBar } from '../../../shared/components/SearchBar';
import { ParkingInformationContent } from './components/ParkingInformationContent';
import { ErrorCard } from '../../../shared/components/ErrorCard';

const currentLocationIcon = {
  url: currentLocationMarkerUrl,
  width: 30,
  height: 30,
  anchorX: 15,
  anchorY: 14,
};

const MIN_PARKING_MARKER_ZOOM = 15;

interface MapLocation {
  latitude: number;
  longitude: number;
}

export const HomePage = () => {
  const navigate = useNavigate();
  const map = useOutletContext<naver.maps.Map | null>();
  const viewport = useMapViewport(map);

  const canShowParkingLots = viewport !== null && viewport.zoom >= MIN_PARKING_MARKER_ZOOM;

  // 선택된 주차장 ID
  const [selectedParkingLotId, setSelectedParkingLotId] = useState<number | null>(null);

  // 바텀시트
  const [sheetSnap, setSheetSnap] = useState<BottomSheetSnap>('collapsed');

  // 주차장 마커 클릭 핸들러
  const handleParkingMarkerClick = (parkingLotId: number) => {
    setSelectedParkingLotId(parkingLotId);
    setSheetSnap('expanded');
  };

  // GPS로 확인한 실제 내 위치
  // 파란색 현재 위치 마커에 사용
  const [currentLocation, setCurrentLocation] = useState<MapLocation | null>(null);

  const requestCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      window.alert('현재 위치를 지원하지 않는 브라우저예요.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = {
          latitude: coords.latitude,
          longitude: coords.longitude,
        };

        setCurrentLocation(location);
        map?.panTo(new naver.maps.LatLng(location.latitude, location.longitude));
      },
      () => {
        window.alert('현재 위치를 가져오지 못했어요. 위치 권한을 확인해 주세요.');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, [map]);

  useEffect(() => {
    if (!map) return;
    requestCurrentLocation();
  }, [map, requestCurrentLocation]);

  return (
    <main className={pageStyle}>
      {map &&
        viewport &&
        (canShowParkingLots ? (
          <ViewportParkingMarkers
            map={map}
            viewport={viewport}
            selectedParkingLotId={selectedParkingLotId}
            onSelect={handleParkingMarkerClick}
          />
        ) : (
          <p className={zoomGuideStyle} role="status" aria-live="polite">
            지도를 확대하면 주차장을 확인할 수 있어요.
          </p>
        ))}

      {currentLocation && (
        <>
          <NaverMapMarker
            map={map}
            latitude={currentLocation.latitude}
            longitude={currentLocation.longitude}
            icon={currentLocationIcon}
            title="현재 위치"
            zIndex={50}
          />
        </>
      )}
      <div className={headerStyle}>
        <SearchBar onClick={() => navigate('/search')} />
      </div>
      <footer className={footerStyle}>
        <CurrentLocationButton onClick={requestCurrentLocation} />
        <BottomNav />
      </footer>

      {selectedParkingLotId !== null && (
        <BottomSheet snap={sheetSnap} onSnapChange={setSheetSnap}>
          <QueryErrorResetBoundary>
            {({ reset }) => (
              <ErrorBoundary
                onReset={reset}
                resetKeys={[selectedParkingLotId]}
                fallbackRender={({ resetErrorBoundary }) => (
                  <ErrorCard label="주차장 정보를 불러오지 못했어요" onRetry={resetErrorBoundary} />
                )}
              >
                <Suspense fallback={<p>주차장 정보를 불러오는 중이에요.</p>}>
                  <ParkingInformationContent parkingLotId={selectedParkingLotId} />
                </Suspense>
              </ErrorBoundary>
            )}
          </QueryErrorResetBoundary>
        </BottomSheet>
      )}
    </main>
  );
};

const pageStyle = css`
  position: relative;
  pointer-events: none;

  width: 100%;
  height: 100%;
  overflow: hidden;
`;

const headerStyle = css`
  position: relative;
  z-index: 1;
  width: 100%;
`;

const zoomGuideStyle = css`
  position: absolute;
  bottom: 100px;
  left: 50%;
  z-index: 1;

  margin: 0;
  padding: 10px 16px;

  color: #101b37;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;

  background: rgb(255 255 255 / 94%);
  border-radius: 999px;
  box-shadow: 0 4px 12px rgb(16 27 55 / 16%);
  transform: translateX(-50%);
`;

const footerStyle = css`
  position: absolute;
  pointer-events: auto;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1;
`;
