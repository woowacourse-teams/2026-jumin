import { useEffect } from 'react';

import type { ParkingSetupView } from '../../../../shared/types/navigation';

interface Props {
  map: naver.maps.Map | null;
  selectedLocation: ParkingSetupView['selectedLocation'];
  onSetupViewChange: (view: ParkingSetupView) => void;
}

/** 지도 중심 동기화, 드래그 이벤트, 옵션 설정 */
export const useParkingSetupMap = ({ map, selectedLocation, onSetupViewChange }: Props) => {
  const { latitude, longitude } = selectedLocation;

  // 기존 지도를 검색 좌표 또는 저장된 좌표로 맞춘다.
  useEffect(() => {
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

      onSetupViewChange({
        selectedLocation: {
          latitude: center.lat(),
          longitude: center.lng(),
        },
        hasMovedMap: true,
      });
    });

    return () => {
      naver.maps.Event.removeListener(listener);
    };
  }, [map, onSetupViewChange]);

  useEffect(() => {
    if (!map) return;

    map.setOptions('disableKineticPan', false);
  }, [map]);
};
