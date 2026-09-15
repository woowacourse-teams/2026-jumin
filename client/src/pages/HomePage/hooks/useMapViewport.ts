import { useEffect, useState } from 'react';
import type { ParkingViewportParams } from '../../../../api/parkingLots';

export type MapViewport = Readonly<
  ParkingViewportParams & {
    zoom: number;
  }
>;

interface UseMapViewportOptions {
  onViewportChange?: (viewport: MapViewport) => void;
}

export const useMapViewport = (
  map: naver.maps.Map | null,
  { onViewportChange }: UseMapViewportOptions = {},
) => {
  const [viewport, setViewport] = useState<MapViewport | null>(null);

  useEffect(() => {
    if (!map) return;

    const updateViewport = () => {
      const bounds = map.getBounds() as naver.maps.LatLngBounds;

      const southWest = bounds.getSW();
      const northEast = bounds.getNE();

      const nextViewport: MapViewport = {
        zoom: map.getZoom(),
        southLatitude: southWest.lat(),
        westLongitude: southWest.lng(),
        northLatitude: northEast.lat(),
        eastLongitude: northEast.lng(),
      };

      setViewport(nextViewport);
      onViewportChange?.(nextViewport);
    };

    updateViewport();

    const listener = naver.maps.Event.addListener(map, 'idle', updateViewport);

    return () => {
      naver.maps.Event.removeListener(listener);
    };
  }, [map, onViewportChange]);

  return viewport;
};
