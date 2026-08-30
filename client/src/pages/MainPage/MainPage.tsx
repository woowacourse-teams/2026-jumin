import { css } from '@emotion/css';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import currentLocationMarkerUrl from '../../../assets/icons/markers/currentLocation.svg';
import { SearchBar } from '../../../shared/components/SearchBar';
import { BottomNav } from '../../../shared/components/BottomNav';
import { CurrentLocationButton } from './components/CurrentLocationButton';
import { NearbyParkingMarkers } from './components/NearbyParkingMarkers';
import { NaverMapMarker } from '../../../shared/maps/NaverMapMarker';

const currentLocationIcon = {
  url: currentLocationMarkerUrl,
  width: 30,
  height: 30,
  anchorX: 15,
  anchorY: 14,
};

interface MapLocation {
  latitude: number;
  longitude: number;
}

export const MainPage = () => {
  const navigate = useNavigate();
  const map = useOutletContext<naver.maps.Map | null>();

  // GPS로 확인한 실제 내 위치
  // 파란색 현재 위치 마커에 사용
  const [currentLocation, setCurrentLocation] = useState<MapLocation | null>(null);

  // 주차장 검색 중심
  // 600m 원과 API 요청에 사용
  const [searchCenter, setSearchCenter] = useState<MapLocation | null>(null);

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
        setSearchCenter(location);

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

  useEffect(() => {
    if (!map) return;

    const listener = naver.maps.Event.addListener(
      map,
      'click',
      (event: naver.maps.PointerEvent) => {
        const coordinate = event.coord as naver.maps.LatLng;
        const clickedLocation = {
          latitude: coordinate.lat(),
          longitude: coordinate.lng(),
        };

        setSearchCenter(clickedLocation);
        map.panTo(coordinate);
      },
    );

    return () => {
      naver.maps.Event.removeListener(listener);
    };
  }, [map]);

  // 현재 위치랑 목적지 위치랑 같으면 현재 위치 마커를
  // 다르면 목적지 마커를 표시하도록 하는 분기처리
  const isSearchCenterAtCurrentLocation =
    currentLocation !== null &&
    searchCenter !== null &&
    currentLocation.latitude === searchCenter.latitude &&
    currentLocation.longitude === searchCenter.longitude;

  return (
    <div
      className={css`
        position: relative;
        pointer-events: none;
        width: 100%;
        height: 100%;
        overflow: hidden;
      `}
    >
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

          {searchCenter && (
            <NearbyParkingMarkers
              map={map}
              searchCenter={searchCenter}
              showSearchCenterMarker={!isSearchCenterAtCurrentLocation}
            />
          )}
        </>
      )}
      <div
        className={css`
          position: relative;
          z-index: 1;
          width: 100%;
        `}
      >
        <SearchBar onClick={() => navigate('/search')} />
      </div>
      <footer
        className={css`
          position: absolute;
          pointer-events: auto;
          right: 0;
          bottom: 0;
          left: 0;
          z-index: 1;
        `}
      >
        <CurrentLocationButton onClick={requestCurrentLocation} />
        <BottomNav />
      </footer>
    </div>
  );
};
