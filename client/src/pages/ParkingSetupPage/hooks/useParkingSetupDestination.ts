import { useEffect, useState } from 'react';
import type { Destination } from '../../../../api/contracts';
import { useQuery } from '@tanstack/react-query';
import { destinationNameQueryOptions } from '../../../../api/queries/destinationNameQuery';

interface Props {
  destination: Destination;
  map: naver.maps.Map | null;
  enabled: boolean;
}

interface MapLocation {
  latitude: number;
  longitude: number;
}

export const useParkingSetupDestination = ({ destination, map, enabled }: Props) => {
  const [selectedLocation, setSelectedLocation] = useState<MapLocation>(() => ({
    latitude: destination.latitude,
    longitude: destination.longitude,
  }));

  const [hasMovedMap, setHasMovedMap] = useState(false);

  // 처음 진입했을 때 검색 페이지에서 선택한 목적지로 지도를 이동한다.
  useEffect(() => {
    if (!map) return;

    map.panTo(new naver.maps.LatLng(destination.latitude, destination.longitude));
  }, [map, destination]);

  // 목적지 확인 단계에서 지도 드래그가 끝나면 중앙 좌표를 저장한다.
  useEffect(() => {
    if (!map || !enabled) return;

    const listener = naver.maps.Event.addListener(map, 'dragend', () => {
      const center = map.getCenter() as naver.maps.LatLng;

      setSelectedLocation({
        latitude: center.lat(),
        longitude: center.lng(),
      });

      setHasMovedMap(true);
    });

    return () => {
      naver.maps.Event.removeListener(listener);
    };
  }, [map, enabled]);

  const { data, isFetching, isError } = useQuery(
    destinationNameQueryOptions({
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
      enabled: hasMovedMap && enabled,
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
