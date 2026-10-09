import { useEffect } from 'react';
import type { Destination } from '../../../../api/contracts';
import { useQuery } from '@tanstack/react-query';
import { destinationNameQueryOptions } from '../../../../api/queries/destinationNameQuery';
import type { ParkingSetupView } from '../../../../shared/types/navigation';

interface Props {
  destination: Destination;
  map: naver.maps.Map | null;
  setupView?: ParkingSetupView;
  onSetupViewChange: (view: ParkingSetupView) => void;
}

export const useParkingSetupDestination = ({
  destination,
  map,
  setupView,
  onSetupViewChange,
}: Props) => {
  // 저장된 값이 없으면 검색 결과 좌표를 사용한다.
  const latitude = setupView?.selectedLocation.latitude ?? destination.latitude;
  const longitude = setupView?.selectedLocation.longitude ?? destination.longitude;

  const selectedLocation = { latitude, longitude };
  const hasMovedMap = setupView?.hasMovedMap ?? false;

  // 검색 좌표 또는 이전에 이동한 좌표로 지도를 맞춘다.
  useEffect(() => {
    if (!map) return;

    const center = map.getCenter() as naver.maps.LatLng;

    if (center.lat() === latitude && center.lng() === longitude) return;

    map.setCenter(new naver.maps.LatLng(latitude, longitude));
  }, [map, latitude, longitude]);

  // 목적지 확인 단계에서 지도 드래그가 끝나면 중앙 좌표를 저장한다.
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

  const { data, isFetching, isError } = useQuery(
    destinationNameQueryOptions({
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
      enabled: hasMovedMap,
    }),
  );

  let destinationName = destination.name;

  if (hasMovedMap) {
    if (isFetching) {
      destinationName = '위치 확인중 ...';
    } else if (isError) {
      destinationName = '위치 이름을 불러오지 못했습니다.';
    } else if (data) {
      destinationName = data.displayName;
    }
  }

  return { selectedLocation, destinationName, hasMovedMap, isFetching, isError };
};
