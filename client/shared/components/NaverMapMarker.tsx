import { useEffect } from 'react';

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

export const NaverMapMarker = ({ map, latitude, longitude, icon, title, zIndex, onClick }: Props) => {
  useEffect(() => {
    if (!map) return;

    const marker = new naver.maps.Marker({
      map,
      position: new naver.maps.LatLng(latitude, longitude),
      icon: {
        url: icon.url,
        size: new naver.maps.Size(icon.width, icon.height),
        scaledSize: new naver.maps.Size(icon.width, icon.height),
        origin: new naver.maps.Point(0, 0),
        anchor: new naver.maps.Point(icon.anchorX, icon.anchorY),
      },
      title,
      clickable: Boolean(onClick),
      zIndex,
    });

    const listener = onClick ? naver.maps.Event.addListener(marker, 'click', onClick) : null;

    return () => {
      if (listener) naver.maps.Event.removeListener(listener);
      marker.setMap(null);
    };
  }, [icon, latitude, longitude, map, onClick, title, zIndex]);

  return null;
};
