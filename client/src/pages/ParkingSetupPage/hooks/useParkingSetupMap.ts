import { startTransition, useEffect, useEffectEvent, useState } from 'react';
import type { Coordinates } from '../../../shared/types/coordinates';

interface Props {
  map: naver.maps.Map | null;
  /** 드래그와 관성 이동이 끝난 뒤 최종 중심 좌표를 전달한다. */
  onLocationSettled: (location: Coordinates) => void;
}

/** 드래그 이벤트와 지도 옵션 설정 */
export const useParkingSetupMap = ({ map, onLocationSettled }: Props) => {
  // 직접 드래그하는 동안과 손을 뗀 뒤 관성으로 이동하는 동안을 함께 나타낸다.
  const [isDragging, setIsDragging] = useState(false);

  const handleIdle = useEffectEvent(() => {
    if (!map || !isDragging) return;

    const center = map.getCenter() as naver.maps.LatLng;
    map.setOptions('zoomOrigin', center);

    // URL 갱신과 드래그 상태 해제를 함께 반영한다.
    startTransition(() => {
      onLocationSettled({ latitude: center.lat(), longitude: center.lng() });
      setIsDragging(false);
    });
  });

  useEffect(() => {
    if (!map) return;

    const element = map.getElement();
    const previousOrigin = map.getOptions('zoomOrigin');
    const previousKineticPan = map.getOptions('disableKineticPan');

    const syncZoomOrigin = () => {
      map.setOptions('zoomOrigin', map.getCenter());
    };

    map.setOptions('disableKineticPan', false);
    syncZoomOrigin();

    element.addEventListener('wheel', syncZoomOrigin, {
      capture: true,
      passive: true,
    });

    return () => {
      element.removeEventListener('wheel', syncZoomOrigin, true);
      map.setOptions('zoomOrigin', previousOrigin);
      map.setOptions('disableKineticPan', previousKineticPan);
    };
  }, [map]);

  // 드래그한 경우에만 관성이 끝난 최종 좌표를 전달한다. 단순 줌의 idle은 무시한다.
  useEffect(() => {
    if (!map) return;

    const listeners = [
      naver.maps.Event.addListener(map, 'dragstart', () => {
        setIsDragging(true);
      }),
      naver.maps.Event.addListener(map, 'idle', () => {
        handleIdle();
      }),
    ];

    return () => {
      listeners.forEach((listener) => naver.maps.Event.removeListener(listener));
    };
  }, [map]);

  return { isDragging };
};
