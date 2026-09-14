import { useEffect } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { NaverMapMarker } from '../../../../shared/maps/NaverMapMarker';
import { parkingViewportQueryOptions } from '../../../../api/queries/parkingViewportQuery';
import { ParkingViewportParams } from '../../../../api/parkingLots';

import viewportParkingMarkerUrl from '../../../../assets/icons/markers/viewportParkingMarker.svg';

const viewportParkingMarkerIcon = {
  url: viewportParkingMarkerUrl,
  width: 20,
  height: 20,
  anchorX: 10,
  anchorY: 10,
};

interface Props {
  map: naver.maps.Map;
  viewport: Readonly<ParkingViewportParams>;
  selectedParkingLotId: number | null;
  onSelect: (parkingLotId: number) => void;
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
            icon={viewportParkingMarkerIcon}
            title="주차장"
            zIndex={isSelected ? 20 : 10}
            onClick={() => onSelect(parkingLot.id)}
          />
        );
      })}
    </>
  );
};
