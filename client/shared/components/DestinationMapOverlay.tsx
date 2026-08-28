import { useEffect } from 'react';

import destinationMarkerUrl from '../../assets/icons/markers/destinationMarker.svg';
import { NaverMapMarker } from '../maps/NaverMapMarker';

const SEARCH_RADIUS_METERS = 600;

const destinationIcon = {
  url: destinationMarkerUrl,
  width: 20,
  height: 20,
  anchorX: 16,
  anchorY: 16,
};

interface Props {
  map: naver.maps.Map | null;
  latitude: number;
  longitude: number;
  title: string;
}

export const DestinationMapOverlay = ({ map, latitude, longitude, title }: Props) => {
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

  return (
    <NaverMapMarker
      map={map}
      latitude={latitude}
      longitude={longitude}
      icon={destinationIcon}
      title={title}
      zIndex={40}
    />
  );
};
