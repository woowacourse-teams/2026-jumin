import { memo } from 'react';

import { NaverMapMarker } from '../../../../shared/maps/NaverMapMarker';
import type { MapViewport } from '../hooks/useMapViewport';
import { useViewportParkingLots } from '../hooks/useViewportParkingLots';
import { getRepresentativeParkingLotIds } from '../utils/parkingMarkerPolicy';
import homeParkingMarkerUrl from '../../../../assets/icons/markers/homeParkingMarker.svg';
import dotParkingMarkerUrl from '../../../../assets/icons/markers/dotParkingMarker.svg';
import selectedParkingMarkerUrl from '../../../../assets/icons/markers/selectedHomeParkingMarker.svg';
import type { ParkingLotViewport } from '../../../../api/contracts';
import type { ParkingViewportFilters } from '../../../../api/parkingLots';

const homeParkingMarkerIcon = {
  url: homeParkingMarkerUrl,
  width: 25,
  height: 25,
  anchorX: 12.5,
  anchorY: 25,
};

const dotParkingMarkerIcon = {
  url: dotParkingMarkerUrl,
  width: 10,
  height: 10,
  anchorX: 5,
  anchorY: 10,
};

const selectedParkingMarkerIcon = {
  url: selectedParkingMarkerUrl,
  width: 30,
  height: 33,
  anchorX: 15,
  anchorY: 33,
};

interface Props {
  map: naver.maps.Map;
  viewport: MapViewport;
  filters?: ParkingViewportFilters;
  selectedParkingLotId: number | null;
  onSelect: (parkingLot: ParkingLotViewport) => void;
}

interface MarkerProps {
  map: naver.maps.Map;
  parkingLot: ParkingLotViewport;
  icon: Parameters<typeof NaverMapMarker>[0]['icon'];
  zIndex: number;
  onSelect: Props['onSelect'];
}

// 주차장별 콜백 생성도 memo 안에 두어, 부모가 렌더링돼도 같은 마커는 건너뛴다.
const ViewportParkingMarker = memo(({ map, parkingLot, icon, zIndex, onSelect }: MarkerProps) => {
  return (
    <NaverMapMarker
      map={map}
      latitude={parkingLot.latitude}
      longitude={parkingLot.longitude}
      icon={icon}
      title="주차장"
      zIndex={zIndex}
      onClick={() => onSelect(parkingLot)}
    />
  );
});
ViewportParkingMarker.displayName = 'ViewportParkingMarker';

export const ViewportParkingMarkers = ({
  map,
  viewport,
  filters = { freeOnly: false, excludeMechanical: false, isPublic: false },
  selectedParkingLotId,
  onSelect,
}: Props) => {
  const { data } = useViewportParkingLots(viewport, filters);

  const parkingMarkers = data?.parkingLots ?? [];

  const representativeIds = getRepresentativeParkingLotIds(parkingMarkers, viewport.zoom);

  return (
    <>
      {parkingMarkers.map((parkingLot) => {
        const isSelected = parkingLot.id === selectedParkingLotId;
        const isRepresentative = representativeIds === null || representativeIds.has(parkingLot.id);
        // 선택 상태를 먼저 적용해 점 마커도 클릭하면 선택 마커로 바뀐다.
        const icon = isSelected
          ? selectedParkingMarkerIcon
          : isRepresentative
            ? homeParkingMarkerIcon
            : dotParkingMarkerIcon;

        return (
          <ViewportParkingMarker
            key={parkingLot.id}
            map={map}
            parkingLot={parkingLot}
            icon={icon}
            zIndex={isSelected ? 20 : isRepresentative ? 10 : 5}
            onSelect={onSelect}
          />
        );
      })}
    </>
  );
};
