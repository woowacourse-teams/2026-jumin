import { useEffect } from 'react';

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
      strokeColor: '#4356d8',
      strokeOpacity: 0.7,
      strokeWeight: 2,
      fillColor: '#4356d8',
      fillOpacity: 0.08,
      clickable: false,
      zIndex: 1,
    });

    return () => circle.setMap(null);
  }, [latitude, longitude, map]);
  return null;
};
