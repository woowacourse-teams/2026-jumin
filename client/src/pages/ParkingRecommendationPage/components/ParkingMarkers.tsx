import type { ParkingLotSummary } from '../../../../api/contracts';
import defaultRecommendationMarkerUrl from '../../../../assets/icons/markers/defaultRecommandMarker.svg';
import destinationMarkerUrl from '../../../../assets/icons/markers/destinationMarker.svg';
import selectedRecommendationMarkerUrl from '../../../../assets/icons/markers/selectedRecommandMarker.svg';
import unselectedRecommendationMarkerUrl from '../../../../assets/icons/markers/unselectedRecommandMarker.svg';
import { NaverMapMarker } from '../../../../shared/components/NaverMapMarker';
import { getParkingMarkerType, type ParkingMarkerType } from './parkingMarker';

const markerIcons = {
  selected: {
    url: selectedRecommendationMarkerUrl,
    width: 74,
    height: 90,
    anchorX: 37,
    anchorY: 73,
  },
  recommended: {
    url: unselectedRecommendationMarkerUrl,
    width: 50,
    height: 61,
    anchorX: 25,
    anchorY: 49.5,
  },
  candidate: {
    url: defaultRecommendationMarkerUrl,
    width: 20,
    height: 20,
    anchorX: 10,
    anchorY: 10,
  },
} satisfies Record<ParkingMarkerType, Parameters<typeof NaverMapMarker>[0]['icon']>;

const destinationIcon = {
  url: destinationMarkerUrl,
  width: 32,
  height: 32,
  anchorX: 16,
  anchorY: 16,
};

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
      <NaverMapMarker
        map={map}
        latitude={destination.latitude}
        longitude={destination.longitude}
        icon={destinationIcon}
        title={destination.name}
        zIndex={40}
      />

      {parkingLots.map((parkingLot) => {
        const markerType = getParkingMarkerType(parkingLot.id, selectedParkingLotId, recommendedParkingLotIds);

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
