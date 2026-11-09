import { useCallback, useRef } from 'react';
import { getBottomSheetSnapHeight, type BottomSheetSnap } from '../components/ui/BottomSheet';
import { getMapCenterForMarkerY } from '../maps/getMapCenterForMarkerY';

export const useVisibleMapCenter = () => {
  const conditionBarRef = useRef<HTMLElement>(null);

  const getCenter = useCallback(
    (map: naver.maps.Map, sheetSnap: BottomSheetSnap, position: naver.maps.LatLng) => {
      const mapHeight = map.getSize().height;
      const sheetHeight = getBottomSheetSnapHeight(sheetSnap, mapHeight);
      const header = conditionBarRef.current;

      if (!header) return;

      const headerBottom =
        header.getBoundingClientRect().bottom - map.getElement().getBoundingClientRect().top;
      const sheetTop = mapHeight - sheetHeight;
      if (sheetTop <= headerBottom) return;
      const targetY = (headerBottom + sheetTop) / 2;
      const center = getMapCenterForMarkerY(map, position, targetY);

      return center;
    },
    [],
  );
  return { conditionBarRef, getCenter };
};
