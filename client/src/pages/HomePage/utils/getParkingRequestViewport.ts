import type { ParkingViewportParams } from '../../../../api/parkingLots';
import type { MapViewport } from '../hooks/useMapViewport';

export const getParkingRequestViewport = (viewport: MapViewport): ParkingViewportParams => {
  const { zoom, ...bounds } = viewport;
  if (zoom < 15 || zoom >= 17) return bounds;

  // 처음 두 줌에서는 화면 중앙만 조회해 표시할 주차장 수를 줄인다.
  const scale = zoom < 16 ? 0.7 : 0.85;

  const centerLatitude = (bounds.southLatitude + bounds.northLatitude) / 2;
  const centerLongitude = (bounds.westLongitude + bounds.eastLongitude) / 2;
  const halfLatitudeSpan = ((bounds.northLatitude - bounds.southLatitude) * scale) / 2;
  const halfLongitudeSpan = ((bounds.eastLongitude - bounds.westLongitude) * scale) / 2;

  return {
    southLatitude: centerLatitude - halfLatitudeSpan,
    westLongitude: centerLongitude - halfLongitudeSpan,
    northLatitude: centerLatitude + halfLatitudeSpan,
    eastLongitude: centerLongitude + halfLongitudeSpan,
  };
};
