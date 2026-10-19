import { useEffect } from 'react';
import { color } from '../../src/theme/color';

const SEARCH_RADIUS_METERS = 600;

interface Props {
  map: naver.maps.Map | null;
  latitude: number;
  longitude: number;
}

export const SearchRadiusCircle = ({ map, latitude, longitude }: Props) => {
  useEffect(() => {
    if (!map) return;

    const circle = new naver.maps.Circle({
      map,
      center: new naver.maps.LatLng(latitude, longitude),
      radius: SEARCH_RADIUS_METERS,
      strokeColor: color.border.brand,
      strokeOpacity: 0.7,
      strokeWeight: 2,
      fillColor: color.background.brand,
      fillOpacity: 0.08,
      clickable: false,
      zIndex: 1,
    });

    return () => circle.setMap(null);
  }, [latitude, longitude, map]);
  return null;
};
