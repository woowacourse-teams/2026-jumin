import { useEffect } from 'react';
import type { Coordinates } from '../../../shared/types/coordinates';

interface Props {
  map: naver.maps.Map | null;
  onDragEnd: (location: Coordinates) => void;
}

/** 드래그 이벤트와 지도 옵션 설정 */
export const useParkingSetupMap = ({ map, onDragEnd }: Props) => {
  useEffect(() => {
    if (!map) return;

    const element = map.getElement();
    const previousOrigin = map.getOptions('zoomOrigin');

    const syncZoomOrigin = () => {
      map.setOptions('zoomOrigin', map.getCenter());
    };

    syncZoomOrigin();

    element.addEventListener('wheel', syncZoomOrigin, {
      capture: true,
      passive: true,
    });

    return () => {
      element.removeEventListener('wheel', syncZoomOrigin, true);
      map.setOptions('zoomOrigin', previousOrigin);
    };
  }, [map]);

  // 드래그가 끝나면 변경된 좌표를 전달한다.
  useEffect(() => {
    if (!map) return;

    const listener = naver.maps.Event.addListener(map, 'dragend', () => {
      const center = map.getCenter() as naver.maps.LatLng;

      map.setOptions('zoomOrigin', center);

      onDragEnd({
        latitude: center.lat(),
        longitude: center.lng(),
      });
    });

    return () => {
      naver.maps.Event.removeListener(listener);
    };
  }, [map, onDragEnd]);
};
