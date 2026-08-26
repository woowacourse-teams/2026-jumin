import { css } from '@emotion/css';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import currentLocationMarkerUrl from '../../../assets/icons/markers/currentLocation.svg';
import { SearchBar } from '../../../shared/components/SearchBar';
import { BottomNav } from '../../../shared/components/BottomNav';
import { CurrentLocationButton } from './components/CurrentLocationButton';
import { NaverMap } from '../../../shared/components/NaverMap';
import { NaverMapMarker } from '../../../shared/components/NaverMapMarker';

const currentLocationIcon = {
  url: currentLocationMarkerUrl,
  width: 30,
  height: 30,
  anchorX: 23,
  anchorY: 21,
};

export const MainPage = () => {
  const navigate = useNavigate();
  const [map, setMap] = useState<naver.maps.Map | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const handleCurrentLocationClick = () => {
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
  };

  return (
    <div
      className={css`
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
      `}
    >
      <NaverMap onMapReady={setMap} />
      {currentLocation && (
        <NaverMapMarker
          map={map}
          latitude={currentLocation.latitude}
          longitude={currentLocation.longitude}
          icon={currentLocationIcon}
          title="현재 위치"
          zIndex={50}
        />
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
          right: 0;
          bottom: 0;
          left: 0;
          z-index: 1;
        `}
      >
        <CurrentLocationButton onClick={handleCurrentLocationClick} />
        <BottomNav />
      </footer>
    </div>
  );
};
