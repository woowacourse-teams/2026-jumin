import { useEffect, useRef } from 'react';

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
}

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

    const listener = clickable
      ? naver.maps.Event.addListener(marker, 'click', () => onClickRef.current?.())
      : null;

    return () => {
      if (listener) naver.maps.Event.removeListener(listener);
      marker.setMap(null);
      markerRef.current = null;
    };
  }, [clickable, latitude, longitude, map, title]);

  return null;
};
