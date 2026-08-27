import { css } from '@emotion/css';
import { useEffect, useRef } from 'react';
import { loadNaverMaps } from './loadNaverMaps';

interface Props {
  latitude?: number;
  longitude?: number;
  zoom?: number;
  onMapReady?: (map: naver.maps.Map | null) => void;
}

export const NaverMap = ({ latitude, longitude, zoom = 15, onMapReady }: Props) => {
  // 네이버 지도 SDK가 지도를 삽입할 DOM 요소
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // 생성한 네이버 지도 인스턴스
  const mapRef = useRef<naver.maps.Map | null>(null);

  useEffect(() => {
    // SDK 로딩 중 컴포넌트가 제거됐는지 확인한다.
    let isCancelled = false;

    const initializeMap = async () => {
      try {
        // 네이버 지도 SDK가 준비될 때까지 기다린다.
        await loadNaverMaps();

        // 컴포넌트가 제거됐거나 지도 컨테이너가 없으면 중단한다.
        if (isCancelled || !mapContainerRef.current) return;

        // 지도를 생성할 때 사용할 기본 옵션
        const mapOptions: naver.maps.MapOptions = {
          zoom,
        };

        // 위도와 경도가 모두 전달된 경우에만 중심 좌표를 지정한다.
        if (latitude !== undefined && longitude !== undefined) {
          mapOptions.center = new naver.maps.LatLng(latitude, longitude);
        }

        // 좌표가 없으면 네이버 지도의 기본 중심을 사용한다.
        const map = new naver.maps.Map(mapContainerRef.current, mapOptions);

        mapRef.current = map;
        onMapReady?.(map);
      } catch (error) {
        // 컴포넌트가 살아 있을 때만 오류를 출력한다.
        if (!isCancelled) {
          console.error(error);
        }
      }
    };

    void initializeMap();

    return () => {
      isCancelled = true;

      // 지도 인스턴스와 내부 이벤트를 정리한다.
      onMapReady?.(null);
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [latitude, longitude, onMapReady, zoom]);

  return (
    <div className={mapStyle}>
      <div ref={mapContainerRef} className={mapContainerStyle} role="region" aria-label="지도" />
    </div>
  );
};

const mapStyle = css`
  position: absolute;
  inset: 0;
  z-index: 0;
`;
const mapContainerStyle = css`
  width: 100%;
  height: 100%;
`;
