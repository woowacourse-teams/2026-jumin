import { App } from '@capacitor/app';
import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { buildDirectionsUrl, type Coordinate, type DirectionsProvider, type ParkingTarget } from './domain';

export type LocationPermissionState = 'PROMPT' | 'GRANTED' | 'DENIED' | 'DENIED_PERMANENTLY' | 'UNAVAILABLE';

export type LocationResult =
  | { status: 'GRANTED'; location: Coordinate }
  | { status: Exclude<LocationPermissionState, 'GRANTED'>; reason?: 'TIMEOUT' };

let locationRequest: Promise<LocationResult> | null = null;
let deniedOnce = false;

const validCoordinate = ({ latitude, longitude }: Coordinate) =>
  Number.isFinite(latitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  Number.isFinite(longitude) &&
  longitude >= -180 &&
  longitude <= 180;

// Capacitor iOS는 웹의 maximumAge를 무시하고 호출마다 새 fix를 요청한다.
// 같은 역할을 앱에서 직접 수행해 재측위 대기를 없앤다.
const LOCATION_MAX_AGE_MS = 60_000;
let lastKnownLocation: { location: Coordinate; at: number } | null = null;

const rememberLocation = (location: Coordinate) => {
  lastKnownLocation = { location, at: Date.now() };
  return location;
};

const freshEnoughLocation = () =>
  lastKnownLocation && Date.now() - lastKnownLocation.at < LOCATION_MAX_AGE_MS ? lastKnownLocation.location : null;

const getWebLocation = () =>
  new Promise<LocationResult>((resolve) => {
    if (!navigator.geolocation) {
      resolve({ status: 'UNAVAILABLE' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = { latitude: coords.latitude, longitude: coords.longitude };
        resolve(
          validCoordinate(location)
            ? { status: 'GRANTED', location: rememberLocation(location) }
            : { status: 'UNAVAILABLE' },
        );
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) resolve({ status: 'DENIED' });
        else if (error.code === error.TIMEOUT) resolve({ status: 'PROMPT', reason: 'TIMEOUT' });
        else resolve({ status: 'UNAVAILABLE' });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });

const readNativePosition = async (enableHighAccuracy: boolean, timeout: number): Promise<Coordinate> => {
  const result = await Geolocation.getCurrentPosition({
    enableHighAccuracy,
    timeout,
    maximumAge: LOCATION_MAX_AGE_MS,
  });
  return { latitude: result.coords.latitude, longitude: result.coords.longitude };
};

const getNativeLocation = async (): Promise<LocationResult> => {
  const checked = await Geolocation.checkPermissions();
  let permission = checked.location;
  if (permission !== 'granted')
    permission = (await Geolocation.requestPermissions({ permissions: ['location'] })).location;
  if (permission !== 'granted') {
    const status = deniedOnce || checked.location === 'denied' ? 'DENIED_PERMANENTLY' : 'DENIED';
    deniedOnce = true;
    return { status };
  }
  const cached = freshEnoughLocation();
  if (cached) return { status: 'GRANTED', location: cached };
  try {
    // 600m 반경 추천에는 대략적 위치로 충분하다. 저정확도 요청은 대개 즉시 반환된다.
    const coarse = await readNativePosition(false, 5_000);
    if (validCoordinate(coarse)) return { status: 'GRANTED', location: rememberLocation(coarse) };
  } catch {
    // 저정확도 실패는 무시하고 고정확도로 한 번 더 시도한다.
  }
  try {
    const precise = await readNativePosition(true, 10_000);
    return validCoordinate(precise)
      ? { status: 'GRANTED', location: rememberLocation(precise) }
      : { status: 'UNAVAILABLE' };
  } catch (error) {
    return error instanceof Error && /timeout/i.test(error.message)
      ? { status: 'PROMPT', reason: 'TIMEOUT' }
      : { status: 'UNAVAILABLE' };
  }
};

export const requestCurrentLocation = () => {
  if (!locationRequest) {
    locationRequest = (Capacitor.isNativePlatform() ? getNativeLocation() : getWebLocation()).finally(() => {
      locationRequest = null;
    });
  }
  return locationRequest;
};

export type ExternalOpenResult = { status: 'DISPATCHED' | 'FALLBACK_OPENED' | 'FAILED' };

const openNative = async (provider: DirectionsProvider, url: string): Promise<ExternalOpenResult> => {
  try {
    const canOpen = await AppLauncher.canOpenUrl({ url });
    if (canOpen.value) {
      const result = await AppLauncher.openUrl({ url });
      return { status: result.completed ? 'DISPATCHED' : 'FAILED' };
    }
    if (provider === 'NAVER') {
      const fallback =
        Capacitor.getPlatform() === 'ios'
          ? 'https://apps.apple.com/kr/app/naver-map-navigation/id311867728'
          : 'market://details?id=com.nhn.android.nmap';
      const result = await AppLauncher.openUrl({ url: fallback });
      return { status: result.completed ? 'FALLBACK_OPENED' : 'FAILED' };
    }
    const result = await AppLauncher.openUrl({ url });
    return { status: result.completed ? 'FALLBACK_OPENED' : 'FAILED' };
  } catch {
    return { status: 'FAILED' };
  }
};

export const openDirections = async (
  provider: DirectionsProvider,
  target: ParkingTarget,
): Promise<ExternalOpenResult> => {
  const url = buildDirectionsUrl(provider, target, {
    naverMapAppName: __APP_CONFIG__.naverMapAppName,
    tmapAppKey: __APP_CONFIG__.tmapAppKey,
  });
  if (!url) return { status: 'FAILED' };
  if (Capacitor.isNativePlatform()) return openNative(provider, url);
  try {
    const handle = window.open(url, '_blank');
    if (!handle) return { status: 'FAILED' };
    try {
      handle.opener = null;
    } catch {
      // 다른 origin의 WindowProxy는 opener 변경을 거부할 수 있다.
    }
    return { status: 'DISPATCHED' };
  } catch {
    return { status: 'FAILED' };
  }
};

export const openNaverWebFallback = (): ExternalOpenResult => {
  try {
    const handle = window.open('https://map.naver.com', '_blank');
    if (!handle) return { status: 'FAILED' };
    try {
      handle.opener = null;
    } catch {
      // 다른 origin의 WindowProxy는 opener 변경을 거부할 수 있다.
    }
    return { status: 'FALLBACK_OPENED' };
  } catch {
    return { status: 'FAILED' };
  }
};

export const registerNativeBack = async (listener: () => void) => {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return () => undefined;
  const handle = await App.addListener('backButton', listener);
  return () => void handle.remove();
};

export const exitNativeApp = async () => {
  if (Capacitor.getPlatform() === 'android') await App.exitApp();
};
