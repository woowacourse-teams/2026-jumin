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
    return `https://map.kakao.com/link/to/${encodeURIComponent(target.name)},${target.location.latitude},${target.location.longitude}`;
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
