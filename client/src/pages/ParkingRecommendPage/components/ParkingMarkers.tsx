import type { ParkingLotSummary } from '../../../../api/contracts';

import homeParkingMarkerUrl from '../../../../assets/icons/markers/homeParkingMarker.svg';
import dotParkingMarkerUrl from '../../../../assets/icons/markers/dotParkingMarker.svg';
import selectedParkingMarkerUrl from '../../../../assets/icons/markers/selectedHomeParkingMarker.svg';

import { DestinationMapOverlay } from '../../../../shared/components/service/destination/DestinationMapOverlay';
import { NaverMapMarker } from '../../../../shared/maps/NaverMapMarker';
import { getParkingMarkerType, type ParkingMarkerType } from './parkingMarker';

const markerIcons = {
  selected: {
    url: selectedParkingMarkerUrl,
    width: 30,
    height: 33,
    anchorX: 15,
    anchorY: 33,
  },
  recommended: {
    url: homeParkingMarkerUrl,
    width: 25,
    height: 25,
    anchorX: 12.5,
    anchorY: 25,
  },
  candidate: {
    url: dotParkingMarkerUrl,
    width: 10,
    height: 10,
    anchorX: 5,
    anchorY: 10,
  },
} satisfies Record<ParkingMarkerType, Parameters<typeof NaverMapMarker>[0]['icon']>;

interface Props {
  map: naver.maps.Map | null;
  destination: {
    name: string;
    latitude: number;
    longitude: number;
  };
  parkingLots: ParkingLotSummary[];
  recommendedParkingLots: ParkingLotSummary[];
  selectedParkingLotId: number | null;
  onSelect: (parkingLot: ParkingLotSummary) => void;
}

export const ParkingMarkers = ({
  map,
  destination,
  parkingLots,
  recommendedParkingLots,
  selectedParkingLotId,
  onSelect,
}: Props) => {
  const recommendedParkingLotIds = recommendedParkingLots.map((parkingLot) => parkingLot.id);

  return (
    <>
      <DestinationMapOverlay
        map={map}
        latitude={destination.latitude}
        longitude={destination.longitude}
        title={destination.name}
      />

      {parkingLots.map((parkingLot) => {
        const markerType = getParkingMarkerType(
          parkingLot.id,
          selectedParkingLotId,
          recommendedParkingLotIds,
        );

        return (
          <NaverMapMarker
            key={parkingLot.id}
            map={map}
            latitude={parkingLot.location.latitude}
            longitude={parkingLot.location.longitude}
            icon={markerIcons[markerType]}
            title={parkingLot.name}
            zIndex={markerType === 'selected' ? 30 : markerType === 'recommended' ? 20 : 10}
            onClick={() => onSelect(parkingLot)}
          />
        );
      })}
    </>
  );
};
