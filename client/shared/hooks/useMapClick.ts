import { useEffect } from 'react';

interface Props {
  map: naver.maps.Map | null;
  enabled: boolean;
  onMapClick: () => void;
}

export const useMapClick = ({ map, enabled, onMapClick }: Props) => {
  useEffect(() => {
    if (!map || !enabled) return;

    const listener = naver.maps.Event.addListener(map, 'click', onMapClick);

    return () => {
      naver.maps.Event.removeListener(listener);
    };
  }, [map, enabled, onMapClick]);
};
