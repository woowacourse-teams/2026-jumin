/** 네이버 지도 웹 SDK 스크립트 로더. 인증 실패와 타임아웃을 구분해 실패시킨다. */

import type { NaverMaps } from './naverTypes';

let mapLoader: Promise<NaverMaps> | null = null;
let mapAuthenticationFailed = false;

export const loadNaverMaps = () => {
  if (mapAuthenticationFailed) return Promise.reject(new Error('NAVER_MAP_AUTH_FAILED'));
  if (window.naver?.maps) return Promise.resolve(window.naver.maps);
  if (mapLoader) return mapLoader;
  mapLoader = new Promise<NaverMaps>((resolve, reject) => {
    if (!__APP_CONFIG__.naverMapClientId) {
      reject(new Error('NAVER_MAP_CLIENT_ID_MISSING'));
      return;
    }
    const script = document.createElement('script');
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      script.remove();
      mapLoader = null;
      reject(error);
    };
    const timeout = window.setTimeout(() => {
      fail(new Error('NAVER_MAP_TIMEOUT'));
    }, 10_000);
    window.navermap_authFailure = () => {
      mapAuthenticationFailed = true;
      window.dispatchEvent(new Event('naver-map-auth-failure'));
      fail(new Error('NAVER_MAP_AUTH_FAILED'));
    };
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(__APP_CONFIG__.naverMapClientId)}`;
    script.async = true;
    script.addEventListener('load', () => {
      if (!window.naver?.maps) {
        fail(new Error('NAVER_MAP_LOAD_FAILED'));
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      resolve(window.naver.maps);
    });
    script.addEventListener('error', () => fail(new Error('NAVER_MAP_LOAD_FAILED')));
    document.head.append(script);
  });
  return mapLoader;
};
