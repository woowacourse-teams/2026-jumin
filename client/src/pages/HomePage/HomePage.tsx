import { Row } from '../../shared/components/ui/Row';
import { Notice } from '../../shared/components/ui/Notice';
import { useOutletContext, useSearchParams } from 'react-router';
import { css } from '@emotion/css';

import { useCallback, useLayoutEffect, useState } from 'react';
import currentLocationMarkerUrl from '../../../assets/icons/markers/currentLocation.svg';
import { type MapViewport, useMapViewport } from './hooks/useMapViewport';
import { ViewportParkingMarkers } from './components/ViewportParkingMarkers';
import { NaverMapMarker } from '../../shared/maps/NaverMapMarker';
import { CurrentLocationButton } from './components/CurrentLocationButton';
import { BottomNav } from '../../shared/components/service/BottomNav';
import { SearchBar } from '../../shared/components/service/destination/SearchBar';
import type { ParkingLotViewport } from '../../api/contracts';
import { useMapClick } from '../../shared/hooks/useMapClick';
import { ParkingInformationPanel } from './components/ParkingInformationPanel';
import { trackEvent } from '../../shared/analytics';
import { eventName } from '../../shared/monitoring/constants';
import type { ParkingFilters } from '../../shared/types/parkingFilters';
import { ParkingFilterBar } from '../../shared/components/service/parking/ParkingFilterBar';
import { useStepNavigation } from '../../shared/hooks/useStepNavigation';
import { useBottomSheet } from '../../shared/hooks/useBottomSheet';
import { useLingeringValue } from '../../shared/hooks/useLingeringValue';
import { BOTTOM_SHEET_TRANSITION_MS } from '../../shared/components/ui/BottomSheet';
import { buildQueryString } from '../../shared/hooks/useQueryParams';
import { parseCoordinates } from '../../shared/utils/parseCoordinates';

const currentLocationIcon = {
  url: currentLocationMarkerUrl,
  width: 30,
  height: 30,
  anchorX: 15,
  anchorY: 15,
};

const MIN_PARKING_MARKER_ZOOM = 15;

const DEFAULT_PARKING_FILTERS: ParkingFilters = {
  freeOnly: false,
  excludeMechanical: false,
  isPublic: false,
};

interface MapLocation {
  latitude: number;
  longitude: number;
}

export const HomePage = () => {
  const { move } = useStepNavigation('home');
  const { map } = useOutletContext<{ map: naver.maps.Map | null }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParkingLotId = Number(searchParams.get('parkingLotId'));
  const searchParkingLotCoordinates = parseCoordinates(
    searchParams.get('lat'),
    searchParams.get('lng'),
  );
  const parkingLotFromSearch =
    Number.isSafeInteger(searchParkingLotId) &&
    searchParkingLotId > 0 &&
    searchParkingLotCoordinates
      ? { id: searchParkingLotId, ...searchParkingLotCoordinates }
      : null;
  const parkingLatitude = parkingLotFromSearch?.latitude;
  const parkingLongitude = parkingLotFromSearch?.longitude;
  const [selectedParkingLot, setSelectedParkingLot] = useState<Pick<
    ParkingLotViewport,
    'id' | 'latitude' | 'longitude'
  > | null>(parkingLotFromSearch);
  const [parkingFilters, setParkingFilters] = useState<ParkingFilters>(DEFAULT_PARKING_FILTERS);

  // 바텀시트
  const sheet = useBottomSheet({ initialIsOpen: parkingLotFromSearch !== null });
  const { close, setSnap, open } = sheet;
  // 선택이 풀려도 시트가 닫히는 전환이 끝날 때까지는 패널을 남겨 둔다.
  const displayedParkingLot = useLingeringValue(selectedParkingLot, BOTTOM_SHEET_TRANSITION_MS);

  const clearParkingSelection = useCallback(() => {
    close();
    setSelectedParkingLot(null);
    if (searchParams.has('parkingLotId')) setSearchParams({}, { replace: true });
  }, [close, searchParams, setSearchParams]);

  useLayoutEffect(() => {
    if (!map || parkingLatitude === undefined || parkingLongitude === undefined) return;
    map.setZoom(15);
    map.setCenter(new naver.maps.LatLng(parkingLatitude, parkingLongitude));
  }, [map, parkingLatitude, parkingLongitude]);

  const collapseBottomSheet = useCallback(() => {
    setSnap('collapsed');
  }, [setSnap]);

  const handleViewportChange = useCallback(
    (nextViewport: MapViewport) => {
      const isBelowMinZoom = nextViewport.zoom < MIN_PARKING_MARKER_ZOOM;

      const isSelectedOutside =
        selectedParkingLot !== null &&
        (selectedParkingLot.latitude < nextViewport.southLatitude ||
          selectedParkingLot.latitude > nextViewport.northLatitude ||
          selectedParkingLot.longitude < nextViewport.westLongitude ||
          selectedParkingLot.longitude > nextViewport.eastLongitude);

      if (isBelowMinZoom || isSelectedOutside) {
        clearParkingSelection();
      }
    },
    [selectedParkingLot, clearParkingSelection],
  );

  const viewport = useMapViewport(map, { onViewportChange: handleViewportChange });

  /** 현재 뷰포트에서 주차장을 볼 수 있는지 여부 */
  const canShowParkingLots = viewport !== null && viewport.zoom >= MIN_PARKING_MARKER_ZOOM;

  // 주차장 마커 클릭 핸들러
  const handleParkingMarkerClick = useCallback(
    (parkingLot: ParkingLotViewport) => {
      trackEvent(eventName.HOME_PAGE_MARKER);
      setSelectedParkingLot(parkingLot);
      open('medium');
    },
    [open],
  );

  // 빈 지도 영역 클릭시 바텀시트 닫기
  useMapClick({
    map,
    enabled: sheet.isOpen && sheet.snap !== 'collapsed',
    onMapClick: collapseBottomSheet,
  });

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

  const handleSearchBarClick = () => {
    trackEvent(eventName.DESTINATION_SEARCH_BAR);

    if (!map) return;

    const center = map.getCenter() as naver.maps.LatLng;
    const queryString = buildQueryString({
      lat: String(center.lat()),
      lng: String(center.lng()),
    });
    move('OPEN_SEARCH', queryString);
  };

  return (
    <main className={pageStyle}>
      {map &&
        viewport &&
        (canShowParkingLots ? (
          <ViewportParkingMarkers
            map={map}
            viewport={viewport}
            filters={parkingFilters}
            selectedParkingLotId={selectedParkingLot?.id ?? null}
            onSelect={handleParkingMarkerClick}
          />
        ) : (
          <Row align="center" justify="center">
            <Notice className={zoomGuideStyle}>지도를 확대해서 주차장을 찾아보세요.</Notice>
          </Row>
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
      {selectedParkingLot === null && (
        <div className={headerStyle}>
          <SearchBar onClick={handleSearchBarClick} />
          <ParkingFilterBar
            className={parkingFilterBarStyle}
            filters={parkingFilters}
            onChange={setParkingFilters}
          />
        </div>
      )}
      <footer className={footerStyle}>
        <div className={floatingControlsStyle}>
          <CurrentLocationButton onClick={requestCurrentLocation} />
        </div>
        {selectedParkingLot === null && <BottomNav />}
      </footer>

      {displayedParkingLot !== null && (
        <ParkingInformationPanel
          map={map}
          parkingLot={displayedParkingLot}
          open={sheet.isOpen}
          snap={sheet.snap}
          onSnapChange={sheet.setSnap}
          onClose={clearParkingSelection}
        />
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

const parkingFilterBarStyle = css`
  width: 100%;
  margin: 10px 0 0;
  padding: 4px 16px 8px;
`;

const zoomGuideStyle = css`
  position: absolute;
  bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 16px);
  z-index: 1;
  width: 60%;
`;

const footerStyle = css`
  position: absolute;
  pointer-events: auto;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1;
`;

const floatingControlsStyle = css`
  position: absolute;
  right: 16px;
  bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 15px);
  z-index: 2;

  pointer-events: auto;
`;
