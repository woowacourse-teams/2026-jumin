import { useEffect } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { NaverMapMarker } from '../../../../shared/maps/NaverMapMarker';
import { parkingViewportQueryOptions } from '../../../../api/queries/parkingViewportQuery';
import type { MapViewport } from '../hooks/useMapViewport';
import homeParkingMarkerUrl from '../../../../assets/icons/markers/homeParkingMarker.svg';
import dotParkingMarkerUrl from '../../../../assets/icons/markers/dotParkingMarker.svg';
import selectedParkingMarkerUrl from '../../../../assets/icons/markers/selectedHomeParkingMaker.svg';
import type { ParkingLotViewport } from '../../../../api/contracts';

const homeParkingMarkerIcon = {
  url: homeParkingMarkerUrl,
  width: 25,
  height: 25,
  anchorX: 10,
  anchorY: 10,
};

const dotParkingMarkerIcon = {
  url: dotParkingMarkerUrl,
  width: 40,
  height: 40,
  anchorX: 14,
  anchorY: 14,
};

const selectedParkingMarkerIcon = {
  url: selectedParkingMarkerUrl,
  width: 30,
  height: 33,
  anchorX: 15,
  anchorY: 33,
};

const REPRESENTATIVE_ZOOM = 15;
const REPRESENTATIVE_COUNT = 10;

interface Props {
  map: naver.maps.Map;
  viewport: MapViewport;
  selectedParkingLotId: number | null;
  onSelect: (parkingLot: ParkingLotViewport) => void;
  onSelectedParkingLotMissing: () => void;
}

export const ViewportParkingMarkers = ({
  map,
  viewport,
  selectedParkingLotId,
  onSelect,
  onSelectedParkingLotMissing,
}: Props) => {
  const { data, isPlaceholderData, isSuccess } = useQuery({
    ...parkingViewportQueryOptions(viewport),
    placeholderData: keepPreviousData,
  });

  const parkingMarkers = data?.parkingLots ?? [];

  // LOD: 줌 15에서만 점수 상위 10개를 대표 마커로 고른다. 동점은 ID로 고정한다.
  const representativeIds =
    viewport.zoom === REPRESENTATIVE_ZOOM
      ? new Set(
          [...parkingMarkers]
            .sort((a, b) => b.score - a.score || a.id - b.id)
            .slice(0, REPRESENTATIVE_COUNT)
            .map(({ id }) => id),
        )
      : null;

  useEffect(() => {
    if (selectedParkingLotId === null || !isSuccess || isPlaceholderData) return;

    const isSelectedParkingLotVisible = data.parkingLots.some(
      ({ id }) => id === selectedParkingLotId,
    );

    if (!isSelectedParkingLotVisible) {
      onSelectedParkingLotMissing();
    }
  }, [data, isPlaceholderData, isSuccess, onSelectedParkingLotMissing, selectedParkingLotId]);

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
          <NaverMapMarker
            key={parkingLot.id}
            map={map}
            latitude={parkingLot.latitude}
            longitude={parkingLot.longitude}
            icon={icon}
            title="주차장"
            zIndex={isSelected ? 20 : isRepresentative ? 10 : 5}
            onClick={() => onSelect(parkingLot)}
          />
        );
      })}
    </>
  );
};
