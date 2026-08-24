import { css } from '@emotion/css';
import { useEffect, useRef } from 'react';

import { loadNaverMaps } from '../naverMap';

interface Props {
  latitude: number;
  longitude: number;
  zoom?: number;
}

export const NaverMap = ({ latitude, longitude, zoom = 15 }: Props) => {
  // 네이버 지도 SDK가 지도를 삽입할 DOM 요소
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // 생성한 지도 인스턴스를 보관한다.
  // 이후 마커 추가, 지도 이동, 자원 정리에 사용한다.
  const mapRef = useRef<naver.maps.Map | null>(null);

  useEffect(() => {
    // SDK 로딩 중 컴포넌트가 사라졌는지 확인하기 위한 값
    let isCancelled = false;

    const initializeMap = async () => {
      try {
        // 네이버 지도 SDK가 준비될 때까지 기다린다.
        await loadNaverMaps();

        // SDK 로딩 중 컴포넌트가 사라졌거나 DOM이 없으면 지도를 만들지 않는다.
        if (isCancelled || !mapContainerRef.current) return;

        // 전달받은 위도와 경도를 네이버 지도 좌표 객체로 변환한다.
        const center = new naver.maps.LatLng(latitude, longitude);

        // 실제 DOM 요소 안에 네이버 지도를 생성한다.
        mapRef.current = new naver.maps.Map(mapContainerRef.current, {
          center,
          zoom,
        });
      } catch (error) {
        // Client ID 누락, 도메인 인증 또는 네트워크 오류를 확인한다.
        console.error(error);
      }
    };

    // async 함수의 Promise를 의도적으로 기다리지 않고 실행한다.
    void initializeMap();

    return () => {
      // 컴포넌트가 사라진 뒤 비동기 로딩 결과가 반영되지 않게 한다.
      isCancelled = true;

      // 네이버 지도에서 생성한 이벤트와 내부 자원을 정리한다.
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [latitude, longitude, zoom]);

  return <div ref={mapContainerRef} className={mapStyle} role="region" aria-label="지도" />;
};

const mapStyle = css`
  position: absolute;
  inset: 0;
  z-index: 0;
`;
