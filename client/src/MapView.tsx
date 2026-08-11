import { useEffect, useId, useRef, useState } from 'react';
import styled from '@emotion/styled';
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Coordinate, ParkingLotSummary } from './domain';

type Listener = object;
type Overlay = { setMap(map: NaverMap | null): void; setIcon?(icon: NaverMarkerIcon): void };
type NaverMarkerIcon = { content: string; size: NaverSize; anchor: NaverPoint };
type NaverMap = { setCenter(point: NaverLatLng): void; panTo(point: NaverLatLng): void };
type NaverLatLng = object;
type NaverSize = object;
type NaverPoint = object;

interface NaverMaps {
  Map: new (
    element: HTMLElement,
    options: {
      center: NaverLatLng;
      zoom: number;
      minZoom: number;
      zoomControl: boolean;
      scaleControl: boolean;
      logoControl: boolean;
      mapDataControl: boolean;
    },
  ) => NaverMap;
  LatLng: new (latitude: number, longitude: number) => NaverLatLng;
  Size: new (width: number, height: number) => NaverSize;
  Point: new (x: number, y: number) => NaverPoint;
  Marker: new (options: { map: NaverMap; position: NaverLatLng; icon: NaverMarkerIcon; title?: string }) => Overlay;
  Circle: new (options: {
    map: NaverMap;
    center: NaverLatLng;
    radius: number;
    strokeColor: string;
    strokeOpacity: number;
    strokeWeight: number;
    fillColor: string;
    fillOpacity: number;
  }) => Overlay;
  Event: {
    addListener(target: object, eventName: string, listener: () => void): Listener;
    removeListener(listener: Listener): void;
    trigger(target: object, eventName: string): void;
  };
}

declare global {
  interface Window {
    naver?: { maps: NaverMaps };
    navermap_authFailure?: () => void;
  }
}

let mapLoader: Promise<NaverMaps> | null = null;
let mapAuthenticationFailed = false;
const EMPTY_PARKING_LOTS: ParkingLotSummary[] = [];
const EMPTY_IDS: string[] = [];
const isNativeIOS = Capacitor.getPlatform() === 'ios';
const NativeNaverMap = registerPlugin<{
  show(options: Record<string, unknown>): Promise<void>;
  hide(options: { id: string }): Promise<void>;
  addListener(event: 'markerClick', listener: (data: { parkingLotId: string }) => void): Promise<{ remove(): void }>;
}>('NativeNaverMap');

const loadNaverMaps = () => {
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

const pinHtml = (label: string, selected: boolean, recommended: boolean) => {
  const background = selected ? '#4356d8' : recommended ? '#ffffff' : '#687083';
  const color = selected ? '#ffffff' : recommended ? '#4356d8' : '#ffffff';
  const border = selected ? '#ffffff' : recommended ? '#4356d8' : '#ffffff';
  const size = selected ? 42 : 34;
  return `<button type="button" aria-label="${label}" style="width:${size}px;height:${size}px;border:3px solid ${border};border-radius:50% 50% 50% 12%;background:${background};color:${color};font:700 13px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 4px 12px rgba(30,42,90,.28);transform:rotate(-45deg)"><span style="display:block;transform:rotate(45deg)">${label}</span></button>`;
};

const markerIcon = (maps: NaverMaps, label: string, selected: boolean, recommended: boolean): NaverMarkerIcon => {
  const size = selected ? 42 : 34;
  return {
    content: pinHtml(label, selected, recommended),
    size: new maps.Size(size, size),
    anchor: new maps.Point(size / 2, size),
  };
};

const MapFrame = styled.div<{ height: string; native: boolean }>`
  position: relative;
  width: 100%;
  height: ${({ height }) => height};
  overflow: hidden;
  ${({ native }) =>
    native
      ? 'background: transparent;'
      : `background-color: #eef1f8;
         background-image:
           linear-gradient(36deg, transparent 45%, rgba(255, 255, 255, 0.9) 46% 52%, transparent 53%),
           linear-gradient(110deg, transparent 44%, rgba(203, 210, 225, 0.65) 45% 49%, transparent 50%);`}
`;

const Canvas = styled.div`
  width: 100%;
  height: 100%;

  img[src='http://static.naver.net/maps/mantle/2x/new-naver-logo-normal.png'],
  img[src='https://static.naver.net/maps/mantle/2x/new-naver-logo-normal.png'] {
    display: none !important;
  }
`;

const ErrorBanner = styled.div`
  position: absolute;
  inset: 50% 16px auto;
  z-index: 2;
  transform: translateY(-50%);
  padding: 10px 12px;
  border: 1px solid #d8dce8;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.94);
  color: #4f566b;
  font-size: 13px;
  text-align: center;
`;

interface MapViewProps {
  center: Coordinate;
  destination?: Coordinate | null;
  currentLocation?: Coordinate | null;
  parkingLots?: ParkingLotSummary[];
  recommendedIds?: string[];
  selectedId?: string | null;
  radius?: boolean;
  height?: string;
  onSelect?: (parkingLotId: string) => void;
}

export const MapView = ({
  center,
  destination = null,
  currentLocation = null,
  parkingLots = EMPTY_PARKING_LOTS,
  recommendedIds = EMPTY_IDS,
  selectedId = null,
  radius = false,
  height = '100%',
  onSelect,
}: MapViewProps) => {
  const nativeMapId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<NaverMap | null>(null);
  const mapsRef = useRef<NaverMaps | null>(null);
  const markerRefs = useRef(new Map<string, Overlay>());
  const onSelectRef = useRef(onSelect);
  const [error, setError] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    const overlays: Overlay[] = [];
    const listeners: Listener[] = [];
    const markerMap = markerRefs.current;
    if (isNativeIOS && container) {
      document.documentElement.classList.add('native-map-visible');
      const ancestors: Array<{ element: HTMLElement; background: string }> = [];
      for (let element: HTMLElement | null = container; element; element = element.parentElement) {
        ancestors.push({ element, background: element.style.background });
        element.style.setProperty('background', 'transparent', 'important');
      }
      const show = () => {
        const frame = container.getBoundingClientRect();
        void NativeNaverMap.show({
          id: nativeMapId,
          frame: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
          center,
          destination,
          currentLocation,
          parkingLots,
          recommendedIds,
          selectedId,
          radius,
        }).catch((caught) => {
          console.error('NATIVE_NAVER_MAP_ERROR', caught);
          setError(true);
        });
      };
      show();
      window.addEventListener('resize', show);
      window.addEventListener('scroll', show, true);
      return () => {
        document.documentElement.classList.remove('native-map-visible');
        ancestors.forEach(({ element, background }) => {
          if (background) element.style.background = background;
          else element.style.removeProperty('background');
        });
        window.removeEventListener('resize', show);
        window.removeEventListener('scroll', show, true);
        void NativeNaverMap.hide({ id: nativeMapId });
      };
    }
    void loadNaverMaps()
      .then((maps) => {
        if (cancelled || !container) return;
        mapsRef.current = maps;
        const map = new maps.Map(container, {
          center: new maps.LatLng(center.latitude, center.longitude),
          zoom: 16,
          minZoom: 12,
          zoomControl: false,
          scaleControl: false,
          logoControl: false,
          mapDataControl: false,
        });
        mapRef.current = map;
        if (destination) {
          const position = new maps.LatLng(destination.latitude, destination.longitude);
          overlays.push(
            new maps.Marker({
              map,
              position,
              title: '목적지',
              icon: markerIcon(maps, '도착', false, true),
            }),
          );
          if (radius)
            overlays.push(
              new maps.Circle({
                map,
                center: position,
                radius: 600,
                strokeColor: '#4356d8',
                strokeOpacity: 0.72,
                strokeWeight: 2,
                fillColor: '#4356d8',
                fillOpacity: 0.1,
              }),
            );
        }
        if (currentLocation) {
          overlays.push(
            new maps.Marker({
              map,
              position: new maps.LatLng(currentLocation.latitude, currentLocation.longitude),
              title: '현재 위치',
              icon: markerIcon(maps, '나', false, true),
            }),
          );
        }
        const recommended = new Set(recommendedIds);
        parkingLots.forEach((lot, index) => {
          const recommendationIndex = recommendedIds.indexOf(lot.parkingLotId);
          const marker = new maps.Marker({
            map,
            position: new maps.LatLng(lot.location.latitude, lot.location.longitude),
            title: lot.name,
            icon: markerIcon(
              maps,
              recommendationIndex >= 0 ? String(recommendationIndex + 1) : String(index + 1),
              lot.parkingLotId === selectedId,
              recommended.has(lot.parkingLotId),
            ),
          });
          overlays.push(marker);
          markerMap.set(lot.parkingLotId, marker);
          listeners.push(maps.Event.addListener(marker, 'click', () => onSelectRef.current?.(lot.parkingLotId)));
        });
        window.setTimeout(() => maps.Event.trigger(map, 'resize'), 0);
      })
      .catch((caught) => {
        if (!cancelled) {
          console.error('NAVER_MAP_LOAD_ERROR', caught);
          setError(true);
        }
      });
    return () => {
      cancelled = true;
      listeners.forEach((listener) => mapsRef.current?.Event.removeListener(listener));
      overlays.forEach((overlay) => overlay.setMap(null));
      markerMap.clear();
      mapRef.current = null;
      container?.replaceChildren();
    };
    // overlays are rebuilt only when the response set changes, not when selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    nativeMapId,
    destination?.latitude,
    destination?.longitude,
    currentLocation?.latitude,
    currentLocation?.longitude,
    parkingLots,
    recommendedIds,
    selectedId,
    radius,
  ]);

  useEffect(() => {
    if (!isNativeIOS) return;
    let handle: { remove(): void } | undefined;
    void NativeNaverMap.addListener('markerClick', ({ parkingLotId }) => onSelectRef.current?.(parkingLotId)).then(
      (listener) => {
        handle = listener;
      },
    );
    return () => handle?.remove();
  }, []);

  useEffect(() => {
    const maps = mapsRef.current;
    if (!maps) return;
    const recommended = new Set(recommendedIds);
    parkingLots.forEach((lot, index) => {
      const recommendationIndex = recommendedIds.indexOf(lot.parkingLotId);
      markerRefs.current
        .get(lot.parkingLotId)
        ?.setIcon?.(
          markerIcon(
            maps,
            recommendationIndex >= 0 ? String(recommendationIndex + 1) : String(index + 1),
            lot.parkingLotId === selectedId,
            recommended.has(lot.parkingLotId),
          ),
        );
    });
  }, [parkingLots, recommendedIds, selectedId]);

  useEffect(() => {
    const maps = mapsRef.current;
    if (maps && mapRef.current) mapRef.current.panTo(new maps.LatLng(center.latitude, center.longitude));
  }, [center.latitude, center.longitude]);

  useEffect(() => {
    const resize = () => {
      if (mapRef.current && mapsRef.current) mapsRef.current.Event.trigger(mapRef.current, 'resize');
    };
    const authenticationFailure = () => setError(true);
    window.addEventListener('resize', resize);
    window.addEventListener('naver-map-auth-failure', authenticationFailure);
    document.addEventListener('visibilitychange', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('naver-map-auth-failure', authenticationFailure);
      document.removeEventListener('visibilitychange', resize);
    };
  }, []);

  return (
    <MapFrame height={height} native={isNativeIOS} aria-label="지도 영역">
      <Canvas ref={containerRef} />
      {error && <ErrorBanner>지도를 불러오지 못했어요. 아래 정보로 계속 이용할 수 있어요.</ErrorBanner>}
    </MapFrame>
  );
};
