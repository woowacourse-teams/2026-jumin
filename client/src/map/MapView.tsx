/** 웹/네이티브 지도를 같은 props 로 감싼 컴포넌트. */

import { useEffect, useId, useRef, useState } from 'react';

import type { Coordinate, ParkingLotSummary } from '../domain';
import { labelMarkerIcon, lotMarkerIcon } from './markers';
import { loadNaverMaps } from './naverLoader';
import type { Listener, NaverMap, NaverMaps, Overlay } from './naverTypes';
import { isNativeIOS, NativeNaverMap } from './nativeBridge';
import { Canvas, ErrorBanner, MapFrame } from './styles';

const EMPTY_PARKING_LOTS: ParkingLotSummary[] = [];
const EMPTY_IDS: string[] = [];

interface MapViewProps {
  center: Coordinate;
  destination?: Coordinate | null;
  currentLocation?: Coordinate | null;
  parkingLots?: ParkingLotSummary[];
  recommendedIds?: string[];
  selectedId?: string | null;
  radius?: boolean;
  height?: string;
  /**
   * 값이 바뀔 때마다 center로 카메라를 다시 옮긴다.
   * center 좌표가 직전과 같아도 동작해야 하므로(예: '현재 위치로 이동'을 연속으로 누를 때)
   * 좌표가 아니라 별도의 신호로 받는다.
   */
  focusToken?: number;
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
  focusToken = 0,
  onSelect,
}: MapViewProps) => {
  const nativeMapId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<NaverMap | null>(null);
  const mapsRef = useRef<NaverMaps | null>(null);
  const markerRefs = useRef(new Map<string, Overlay>());
  const onSelectRef = useRef(onSelect);
  // 좌표가 같아도 카메라를 되돌리기 위해, 최신 show와 focusToken을 effect 밖에서 참조한다.
  const showRef = useRef<(() => void) | null>(null);
  const focusTokenRef = useRef(focusToken);
  const [error, setError] = useState(false);
  // 호출부가 매 렌더 새 배열을 만들어도 내용이 같으면 지도를 다시 만들지 않는다.
  // (docs/specs/04-recommendations-more.md §5)
  const parkingLotsKey = parkingLots
    .map((lot) => `${lot.parkingLotId}@${lot.location.latitude},${lot.location.longitude}`)
    .join('|');
  const recommendedKey = recommendedIds.join('|');

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
          focusToken: focusTokenRef.current,
        }).catch((caught) => {
          console.error('NATIVE_NAVER_MAP_ERROR', caught);
          setError(true);
        });
      };
      showRef.current = show;
      show();
      window.addEventListener('resize', show);
      // 문서 전역 scroll(capture)은 캐러셀 스와이프 한 번에 브릿지를 수십 번 호출해
      // 네이티브 마커를 통째로 재생성시킨다. 컨테이너 크기 변화만 추적한다.
      const frameObserver = new ResizeObserver(show);
      frameObserver.observe(container);
      return () => {
        document.documentElement.classList.remove('native-map-visible');
        ancestors.forEach(({ element, background }) => {
          if (background) element.style.background = background;
          else element.style.removeProperty('background');
        });
        showRef.current = null;
        window.removeEventListener('resize', show);
        frameObserver.disconnect();
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
              icon: labelMarkerIcon(maps, '도착'),
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
              icon: labelMarkerIcon(maps, '나'),
            }),
          );
        }
        parkingLots.forEach((lot) => {
          const marker = new maps.Marker({
            map,
            position: new maps.LatLng(lot.location.latitude, lot.location.longitude),
            title: lot.name,
            icon: lotMarkerIcon(maps, lot.name, lot.parkingLotId === selectedId),
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
    parkingLotsKey,
    recommendedKey,
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
    parkingLots.forEach((lot) => {
      markerRefs.current
        .get(lot.parkingLotId)
        ?.setIcon?.(lotMarkerIcon(maps, lot.name, lot.parkingLotId === selectedId));
    });
    // 값 기반 키로 비교한다. parkingLots/recommendedIds 참조는 매 렌더 바뀔 수 있다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkingLotsKey, recommendedKey, selectedId]);

  useEffect(() => {
    const maps = mapsRef.current;
    if (maps && mapRef.current) mapRef.current.panTo(new maps.LatLng(center.latitude, center.longitude));
  }, [center.latitude, center.longitude]);

  // '현재 위치로 이동'처럼 같은 좌표를 다시 받는 경우에도 카메라를 center로 되돌린다.
  // 지도와 마커를 다시 만들지 않기 위해 메인 effect와 분리한다.
  useEffect(() => {
    if (!focusToken) return;
    focusTokenRef.current = focusToken;
    if (isNativeIOS) {
      showRef.current?.();
      return;
    }
    const maps = mapsRef.current;
    if (maps && mapRef.current) mapRef.current.panTo(new maps.LatLng(center.latitude, center.longitude));
    // center는 focusToken이 갱신되는 시점의 최신 값을 사용한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusToken]);

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
