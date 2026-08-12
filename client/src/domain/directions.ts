/** 외부 지도 앱 길찾기 URL 생성. */

import type { ParkingTarget } from './types';

export type DirectionsProvider = 'NAVER' | 'KAKAO' | 'TMAP';

export const buildDirectionsUrl = (
  provider: DirectionsProvider,
  target: ParkingTarget,
  config: { naverMapAppName: string; tmapAppKey: string },
) => {
  if (provider === 'NAVER') {
    if (!config.naverMapAppName) return null;
    const url = new URL('nmap://route/car');
    url.search = new URLSearchParams({
      dlat: String(target.location.latitude),
      dlng: String(target.location.longitude),
      dname: target.name,
      appname: config.naverMapAppName,
    }).toString();
    return url.toString();
  }
  if (provider === 'KAKAO')
    // 커스텀 스킴이라야 앱으로 확실히 넘어간다. https 주소는 Universal Link 등록 상태에 따라
    // 기기마다 앱으로 가기도, 브라우저로 새기도 한다.
    // 출발지(sp)는 넘기지 않는다. 카카오맵이 현재 위치를 출발지로 잡는다.
    return `kakaomap://route?ep=${target.location.latitude},${target.location.longitude}&by=car`;
  if (!config.tmapAppKey) return null;
  const url = new URL('https://apis.openapi.sk.com/tmap/app/routes');
  url.search = new URLSearchParams({
    appKey: config.tmapAppKey,
    goalname: target.name,
    goalx: String(target.location.longitude),
    goaly: String(target.location.latitude),
  }).toString();
  return url.toString();
};

/**
 * 앱이 설치돼 있지 않을 때 대신 열 주소.
 * 스토어로 바로 보내는 대신 웹 지도로 안내해 길찾기 맥락을 잇는다.
 */
export const buildDirectionsWebUrl = (provider: DirectionsProvider, target: ParkingTarget) => {
  if (provider === 'KAKAO')
    return `https://map.kakao.com/link/to/${encodeURIComponent(target.name)},${target.location.latitude},${target.location.longitude}`;
  return null;
};
