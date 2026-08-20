export type DirectionsProvider = 'NAVER' | 'KAKAO' | 'TMAP';

export interface Coordinate {
  latitude: number;
  longitude: number;
}

interface DirectionsTarget {
  name: string;
  location: Coordinate;
}

interface BuildDirectionsUrlParams {
  provider: DirectionsProvider;
  start: Coordinate;
  destination: DirectionsTarget;
  appName: string;
}

export const buildDirectionsUrl = ({ provider, start, destination, appName }: BuildDirectionsUrlParams) => {
  if (provider === 'NAVER') {
    const url = new URL('nmap://route/car');
    url.search = new URLSearchParams({
      slat: String(start.latitude),
      slng: String(start.longitude),
      sname: '현재 위치',
      dlat: String(destination.location.latitude),
      dlng: String(destination.location.longitude),
      dname: destination.name,
      appname: appName,
    }).toString();
    return url.toString();
  }

  if (provider === 'KAKAO') {
    const url = new URL('kakaomap://route');
    url.search = new URLSearchParams({
      sp: `${start.latitude},${start.longitude}`,
      ep: `${destination.location.latitude},${destination.location.longitude}`,
      by: 'car',
    }).toString();
    return url.toString();
  }

  const url = new URL('tmap://route');
  url.search = new URLSearchParams({
    rStName: '현재 위치',
    rStX: String(start.longitude),
    rStY: String(start.latitude),
    rGoName: destination.name,
    rGoX: String(destination.location.longitude),
    rGoY: String(destination.location.latitude),
  }).toString();
  return url.toString();
};
