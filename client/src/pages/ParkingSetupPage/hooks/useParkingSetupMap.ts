import { useEffect, useLayoutEffect } from 'react';
import type { Coordinates } from '../../../../shared/types/coordinates';

interface Props {
  map: naver.maps.Map | null;
  selectedLocation: Coordinates;
  onDragEnd: (location: Coordinates) => void;
}

/** 지도 중심 동기화, 드래그 이벤트, 옵션 설정 */
export const useParkingSetupMap = ({ map, selectedLocation, onDragEnd }: Props) => {
  const { latitude, longitude } = selectedLocation;

  // 지도 준비 또는 화면 복귀 후, 페인트 전에 선택 좌표를 반영한다.
  useLayoutEffect(() => {
    if (!map) return;

    const center = map.getCenter() as naver.maps.LatLng;

    if (center.lat() === latitude && center.lng() === longitude) return;

    map.setCenter(new naver.maps.LatLng(latitude, longitude));
  }, [map, latitude, longitude]);

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
