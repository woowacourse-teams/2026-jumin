import type { ParkingLotSummary } from '../../../../api/contracts';
import defaultRecommendationMarkerUrl from '../../../../assets/icons/markers/defaultRecommandMarker.svg';
import selectedRecommendationMarkerUrl from '../../../../assets/icons/markers/selectedRecommandMarker.svg';
import unselectedRecommendationMarkerUrl from '../../../../assets/icons/markers/unselectedRecommandMarker.svg';
import { DestinationMapOverlay } from '../../../../shared/components/DestinationMapOverlay';
import { NaverMapMarker } from '../../../../shared/maps/NaverMapMarker';
import { getParkingMarkerType, type ParkingMarkerType } from './parkingMarker';

const markerIcons = {
  selected: {
    url: selectedRecommendationMarkerUrl,
    width: 50,
    height: 60,
    anchorX: 25,
    anchorY: 60,
  },
  recommended: {
    url: unselectedRecommendationMarkerUrl,
    width: 40,
    height: 61,
    anchorX: 20,
    anchorY: 61,
  },
  candidate: {
    url: defaultRecommendationMarkerUrl,
    width: 20,
    height: 20,
    anchorX: 10,
    anchorY: 20,
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
