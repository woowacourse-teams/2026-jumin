import { useEffect } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { NaverMapMarker } from '../../../../shared/maps/NaverMapMarker';
import { parkingViewportQueryOptions } from '../../../../api/queries/parkingViewportQuery';
import { ParkingViewportParams } from '../../../../api/parkingLots';

import viewportParkingMarkerUrl from '../../../../assets/icons/markers/viewportParkingMarkers.svg';
import { ParkingLotViewport } from '../../../../api/contracts';

const viewportParkingMarkerIcon = {
  url: viewportParkingMarkerUrl,
  width: 40,
  height: 40,
  anchorX: 20,
  anchorY: 20,
};

const selectedParkingMarkerIcon = {
  url: viewportParkingMarkerUrl,
  width: 48,
  height: 56,
  anchorX: 24,
  anchorY: 56,
};

interface Props {
  map: naver.maps.Map;
  viewport: Readonly<ParkingViewportParams>;
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

  const parkingMarkers = [...(data?.parkingLots ?? [])];

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

        return (
          <NaverMapMarker
            key={parkingLot.id}
            map={map}
            latitude={parkingLot.latitude}
            longitude={parkingLot.longitude}
            icon={isSelected ? selectedParkingMarkerIcon : viewportParkingMarkerIcon}
            title="주차장"
            zIndex={isSelected ? 20 : 10}
            onClick={() => onSelect(parkingLot)}
          />
        );
      })}
    </>
  );
};
