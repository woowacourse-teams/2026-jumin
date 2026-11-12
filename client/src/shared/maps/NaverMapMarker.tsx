import { useEffect, useRef } from 'react';
import { durationMs, easing } from '../../theme/motion';

interface MarkerIcon {
  url: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

interface Props {
  map: naver.maps.Map | null;
  latitude: number;
  longitude: number;
  icon: MarkerIcon;
  title: string;
  zIndex?: number;
  onClick?: () => void;
  /**
   * 지도에 추가될 때 커지며 나타나고, 제거될 때 작아지며 사라진다.
   * 필터나 지도 이동으로 목록이 바뀔 때 어떤 주차장이 빠지고 들어왔는지 보이게 한다.
   * @default false
   */
  animated?: boolean;
}

/** 등장·퇴장 때 마커가 시작하거나 끝나는 크기 비율. */
const MARKER_HIDDEN_SCALE = 0.3;

const getMarkerElement = (marker: naver.maps.Marker): HTMLElement | null =>
  typeof marker.getElement === 'function' ? marker.getElement() : null;

/** 움직임 줄이기를 켰거나 전환 API가 없는 환경에서는 전환 없이 바로 추가·제거한다. */
const canAnimate = (element: HTMLElement | null): element is HTMLElement =>
  element !== null &&
  typeof element.animate === 'function' &&
  !(
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

const createMarkerIcon = (icon: MarkerIcon): naver.maps.ImageIcon => ({
  url: icon.url,
  size: new naver.maps.Size(icon.width, icon.height),
  scaledSize: new naver.maps.Size(icon.width, icon.height),
  origin: new naver.maps.Point(0, 0),
  anchor: new naver.maps.Point(icon.anchorX, icon.anchorY),
});

export const NaverMapMarker = ({
  map,
  latitude,
  longitude,
  icon,
  title,
  zIndex,
  onClick,
  animated = false,
}: Props) => {
  const markerRef = useRef<naver.maps.Marker | null>(null);
  const iconRef = useRef(icon);
  const zIndexRef = useRef(zIndex);
  const onClickRef = useRef(onClick);
  const clickable = onClick !== undefined;

  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  useEffect(() => {
    iconRef.current = icon;
    markerRef.current?.setIcon(createMarkerIcon(icon));
  }, [icon]);

  useEffect(() => {
    zIndexRef.current = zIndex;
    markerRef.current?.setOptions('zIndex', zIndex);
  }, [zIndex]);

  useEffect(() => {
    if (!map) return;

    const marker = new naver.maps.Marker({
      map,
      position: new naver.maps.LatLng(latitude, longitude),
      icon: createMarkerIcon(iconRef.current),
      title,
      clickable,
      zIndex: zIndexRef.current,
    });
    markerRef.current = marker;

    const element = animated ? getMarkerElement(marker) : null;
    if (canAnimate(element)) {
      // 핀의 끝(지도 위 좌표)을 기준으로 커지고 작아지게 한다.
      element.style.transformOrigin = `${iconRef.current.anchorX}px ${iconRef.current.anchorY}px`;
      element.animate(
        [
          { opacity: 0, scale: MARKER_HIDDEN_SCALE },
          { opacity: 1, scale: 1 },
        ],
        { duration: durationMs.base, easing: easing.out },
      );
    }

    const listener = clickable
      ? naver.maps.Event.addListener(marker, 'click', () => onClickRef.current?.())
      : null;

    return () => {
      if (listener) naver.maps.Event.removeListener(listener);
      markerRef.current = null;

      const remove = () => marker.setMap(null);
      if (!canAnimate(element) || !element.isConnected) {
        remove();
        return;
      }

      const exit = element.animate(
        [
          { opacity: 1, scale: 1 },
          { opacity: 0, scale: MARKER_HIDDEN_SCALE },
        ],
        { duration: durationMs.fast, easing: easing.out, fill: 'forwards' },
      );
      exit.onfinish = remove;
      exit.oncancel = remove;
    };
  }, [animated, clickable, latitude, longitude, map, title]);

  return null;
};
