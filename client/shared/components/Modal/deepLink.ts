export type DirectionsProvider = 'NAVER' | 'KAKAO' | 'TMAP';

export interface Coordinate {
  latitude: number;
  longitude: number;
}

interface DirectionsTarget {
  name: string;
  location: Coordinate;
}

interface BuildDirectionsLinksParams {
  provider: DirectionsProvider;
  start: Coordinate;
  destination: DirectionsTarget;
  appName: string;
}

const stores = {
  NAVER: {
    androidPackage: 'com.nhn.android.nmap',
    androidUrl: 'https://play.google.com/store/apps/details?id=com.nhn.android.nmap',
    iosUrl: 'https://apps.apple.com/kr/app/id311867728',
  },
  KAKAO: {
    androidPackage: 'net.daum.android.map',
    androidUrl: 'https://play.google.com/store/apps/details?id=net.daum.android.map',
    iosUrl: 'https://apps.apple.com/kr/app/id304608425',
  },
  TMAP: {
    androidPackage: 'com.skt.tmap.ku',
    androidUrl: 'https://play.google.com/store/apps/details?id=com.skt.tmap.ku',
    iosUrl: 'https://apps.apple.com/kr/app/id431589174',
  },
} as const;

export const buildDirectionsLinks = ({ provider, start, destination, appName }: BuildDirectionsLinksParams) => {
  let appUrl: URL;
  let webUrl: string;

  if (provider === 'NAVER') {
    appUrl = new URL('nmap://route/car');
    appUrl.search = new URLSearchParams({
      slat: String(start.latitude),
      slng: String(start.longitude),
      sname: '현재 위치',
      dlat: String(destination.location.latitude),
      dlng: String(destination.location.longitude),
      dname: destination.name,
      appname: appName,
    }).toString();
    webUrl = `https://map.naver.com/p/search/${encodeURIComponent(destination.name)}`;
  } else if (provider === 'KAKAO') {
    appUrl = new URL('kakaomap://route');
    appUrl.search = new URLSearchParams({
      sp: `${start.latitude},${start.longitude}`,
      ep: `${destination.location.latitude},${destination.location.longitude}`,
      by: 'car',
    }).toString();
    webUrl = `https://map.kakao.com/link/by/car/${encodeURIComponent('현재 위치')},${start.latitude},${start.longitude}/${encodeURIComponent(destination.name)},${destination.location.latitude},${destination.location.longitude}`;
  } else {
    appUrl = new URL('tmap://route');
    appUrl.search = new URLSearchParams({
      rStName: '현재 위치',
      rStX: String(start.longitude),
      rStY: String(start.latitude),
      rGoName: destination.name,
      rGoX: String(destination.location.longitude),
      rGoY: String(destination.location.latitude),
    }).toString();
    webUrl = 'https://www.tmap.co.kr';
  }

  const { androidPackage, androidUrl, iosUrl } = stores[provider];
  const [scheme, target] = appUrl.toString().split('://');

  return {
    appUrl: appUrl.toString(),
    webUrl,
    androidIntentUrl: `intent://${target}#Intent;scheme=${scheme};package=${androidPackage};S.browser_fallback_url=${encodeURIComponent(androidUrl)};end`,
    iosStoreUrl: iosUrl,
  };
};
