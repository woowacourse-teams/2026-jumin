import { useEffect } from 'react';
import type { Coordinates } from '../../../shared/types/coordinates';

interface Props {
  map: naver.maps.Map | null;
  onDragEnd: (location: Coordinates) => void;
}

/** 드래그 이벤트와 지도 옵션 설정 */
export const useParkingSetupMap = ({ map, onDragEnd }: Props) => {
  // 드래그가 끝나면 변경된 좌표를 전달한다.
  useEffect(() => {
    if (!map) return;

    const listener = naver.maps.Event.addListener(map, 'dragend', () => {
      const center = map.getCenter() as naver.maps.LatLng;

      onDragEnd({
        latitude: center.lat(),
        longitude: center.lng(),
      });
    });

    return () => {
      naver.maps.Event.removeListener(listener);
    };
  }, [map, onDragEnd]);

  useEffect(() => {
    if (!map) return;

    map.setOptions('disableKineticPan', false);
  }, [map]);
};
